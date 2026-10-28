import "server-only";

import type { Id } from "@/convex/_generated/dataModel";
import { formatEther, parseEther } from "viem";

import { candidates, type Candidate } from "../chain/market";
import { shield, shieldLine } from "../chain/shield";
import { api, mutate, query } from "../db";
import { exitReason, parseSpec, rejects, sizeFor, type Spec } from "../strategy";
import { safeMessage } from "./errors";
import { eth, fillEvent, logEvent } from "./events";
import { feeOf } from "./fees";
import { APPROVAL_TTL_MS, chargeFee, collectFees, getExecutor, getTeam, propose, SentTrade, trade, tradeNow, withLease, type Team } from "./team";

type Strategy = { id: string; owner: string; name: string; spec: unknown; mode: "ask" | "auto" };

/**
 * One pass over every active strategy: at most one new entry per strategy, then exits on open positions.
 * ponytail: sequential over all strategies in one invocation; shard by owner if a tick ever nears the function timeout.
 */
export async function tick() {
  const log: string[] = [];
  await mutate(api.approvals.expire, { ttlMs: APPROVAL_TTL_MS });
  log.push(...(await settle()));
  log.push(...(await collectFees().catch((err) => [`fees: ${safeMessage(err)}`])));
  log.push(...(await handExits().catch((err) => [`hand exits: ${safeMessage(err)}`])));
  const strategies = await query(api.strategies.active, {});
  if (!strategies.length) return log;
  const market = await candidates();
  for (const s of strategies) {
    const spec = parseSpec(s.spec);
    try {
      log.push(...(await enter(s, spec, market)), ...(await exit(s, spec)));
    } catch (err) {
      log.push(`${s.id}: ${safeMessage(err)}`);
    }
  }
  return log;
}

async function enter(s: Strategy, spec: Spec, market: Candidate[]) {
  const sid = s.id as Id<"strategies">;
  const book = (await getTeam(s.owner))?.mode === "paper";
  const [open, pending] = await Promise.all([query(api.book.openForStrategy, { paper: book, strategyId: sid }), query(api.approvals.pending, { owner: s.owner })]);
  if (open.length + pending.filter((a) => a.strategyId === s.id && a.kind === "buy").length >= spec.maxOpen) return [];
  // ponytail: ShieldBot reads at most 3 new matches per strategy per tick (two GeckoTerminal calls each, cached)
  let checked = 0;
  for (const c of await getExecutor().onlyTradable(market.filter((c) => rejects(spec, c) === null))) {
    if (checked >= 3) break;
    if (!(await mutate(api.strategies.match, { strategyId: sid, token: c.token }))) continue;
    checked++;
    // a match ShieldBot turns down stays matched: it is not looked at again by this strategy
    const safety = await shield(c.token, c.pool).catch(() => null);
    if (!safety) {
      await mutate(api.strategies.unmatch, { strategyId: sid, token: c.token }); // no read this time: try again next tick
      continue;
    }
    if (safety.blocks.length || (spec.minSafetyScore !== undefined && safety.score < spec.minSafetyScore)) {
      await logEvent(s.owner, { member: "shield", kind: "skip", text: `Skipped ${c.symbol} for ${s.name}. ${safety.blocks.length ? safety.blocks[0] : `Safety ${safety.score}/100 is under the ${spec.minSafetyScore} bar. ${safety.warns.join(" ")}`}`, token: c.token, symbol: c.symbol });
      continue;
    }
    const wei = parseEther(String(sizeFor(spec, safety.score)));
    const why = `${s.name}: ${c.symbol} matched${c.curvePct !== undefined ? `, ${c.curvePct.toFixed(1)}% up its curve` : ""}${c.mcapUsd !== undefined ? `, $${Math.round(c.mcapUsd).toLocaleString("en-US")} market cap` : ""}. ${shieldLine(safety)}`;
    await logEvent(s.owner, { member: "sniper", kind: "match", text: why, token: c.token, symbol: c.symbol });
    const team = (await getTeam(s.owner))!;
    // "auto" trades on its own only under Autopilot, and only inside its budget; anything else asks the owner
    // on paper no money is at risk: an automatic strategy fills without Autopilot or a budget
    const paper = team.mode === "paper";
    const held = !paper && s.mode === "auto" && team.autopilot.on ? await autoDeployed(s.owner) : 0;
    const overBudget = !paper && held + Number(formatEther(wei)) > team.autopilot.budgetEth;
    if (s.mode === "ask" || (!paper && (!team.autopilot.on || overBudget))) {
      const note = s.mode === "auto" ? (!team.autopilot.on ? " Autopilot is off, so it asks first." : ` That would take Autopilot past its ${team.autopilot.budgetEth} ETH budget, so it asks first.`) : "";
      await propose(s.owner, { kind: "buy", token: c.token, symbol: c.symbol, amount: wei, reason: `${why}${note}`, strategyId: s.id });
      await logEvent(s.owner, { member: "trader", kind: "ask", text: `Asked you to approve a ${eth(wei)} buy of ${c.symbol}.${note}`, token: c.token, symbol: c.symbol });
      return [`${s.id}: asked to buy ${c.symbol}`];
    }
    const f = await auto(team, { kind: "buy", token: c.token, symbol: c.symbol, amount: wei, slippageBps: spec.slippageBps, strategyId: s.id }, why);
    if (!f) await mutate(api.strategies.unmatch, { strategyId: sid, token: c.token }); // wallet busy: try it again next tick
    return [`${s.id}: ${f ? `bought ${c.symbol} ${f}` : "wallet busy"}`];
  }
  return [];
}

/** ETH the owner's automatic strategies have in open positions right now, at cost: what counts against the budget. */
export async function autoDeployed(owner: string): Promise<number> {
  const [open, strategies, sent] = await Promise.all([query(api.book.open, { owner }), query(api.strategies.byOwner, { owner }), query(api.approvals.sent, {})]);
  const auto = new Set(strategies.filter((x) => x.mode === "auto").map((x) => x.id));
  const held = open.filter((p) => p.strategyId && auto.has(p.strategyId)).reduce((t, p) => t + Number(formatEther(BigInt(p.costWei))), 0);
  // buys broadcast but not settled yet: the ETH has left even though the position is not booked
  const pending = sent.filter((a) => a.owner === owner && a.kind === "buy" && a.strategyId && auto.has(a.strategyId)).reduce((t, a) => t + Number(formatEther(BigInt(a.amount))), 0);
  return held + pending;
}

/** Records a new high for each position whose price beat it; returns the high to measure a trailing stop from. */
async function highs(open: Array<{ id: string; peakEth: number | null; paper?: boolean }>, prices: Map<string, number>, tokenOf: (id: string) => string) {
  const out = new Map<string, number>();
  for (const p of open) {
    const price = prices.get(tokenOf(p.id));
    const peak = Math.max(p.peakEth ?? 0, price ?? 0);
    out.set(p.id, peak);
    if (price !== undefined && price > (p.peakEth ?? 0)) await mutate(api.book.peak, { paper: !!p.paper, id: p.id, priceEth: price });
  }
  return out;
}

async function exit(s: Strategy, spec: Spec) {
  if (spec.takeProfitPct === undefined && spec.stopLossPct === undefined && spec.trailingStopPct === undefined) return [];
  // both books: a strategy's live positions keep their exits while the team is on paper, and the other way round
  const sid = s.id as Id<"strategies">;
  const open = [...(await query(api.book.openForStrategy, { strategyId: sid })).map((p) => ({ ...p, paper: false })), ...(await query(api.book.openForStrategy, { paper: true, strategyId: sid })).map((p) => ({ ...p, paper: true }))];
  if (!open.length) return [];
  const prices = await getExecutor().prices(open.map((p) => p.token));
  const peaks = await highs(open, prices, (id) => open.find((p) => p.id === id)!.token);
  const out: string[] = [];
  for (const p of open) {
    const price = prices.get(p.token);
    const entry = Number(p.costWei) / Number(p.tokens); // ETH per whole token: both sides 18 decimals
    const why = price === undefined ? null : exitReason(spec, entry, price, peaks.get(p.id));
    if (!why) continue;
    const reason = `${s.name}: ${p.symbol} hit ${why} (${((price! / entry - 1) * 100).toFixed(0)}%).`;
    await logEvent(s.owner, { member: "sniper", kind: "exit", text: reason, token: p.token, symbol: p.symbol });
    if (s.mode === "ask" && !p.paper) {
      const pending = await query(api.approvals.pending, { owner: s.owner });
      if (!pending.some((a) => a.token === p.token && a.kind === "sell")) await propose(s.owner, { kind: "sell", token: p.token, symbol: p.symbol, amount: 0n, reason, strategyId: s.id });
      continue;
    }
    // Sell exactly this position, so a manual buy of the same token stays put.
    const f = await auto((await getTeam(s.owner))!, { kind: "sell", token: p.token, symbol: p.symbol, amount: BigInt(p.tokens), slippageBps: spec.slippageBps, strategyId: s.id, positionId: p.id, paper: p.paper }, reason);
    out.push(`${s.id}: ${f ? `sold ${p.symbol} (${why})` : "wallet busy"}`);
  }
  return out;
}

/** An automatic trade. A send that is not confirmed in time is recorded as "sent" for settle(). Null when the wallet is busy. */
export async function auto(team: Team, a: Parameters<typeof trade>[1], reason: string, how = "automatically"): Promise<string | null> {
  try {
    const f = await tradeNow(team, a);
    if (f) await logEvent(team.owner, fillEvent(a.kind, a.symbol, a.token, f, how));
    return f?.hash ?? null;
  } catch (err) {
    if (!(err instanceof SentTrade)) {
      await logEvent(team.owner, { member: "trader", kind: "fail", text: `Could not ${a.kind} ${a.symbol}: ${safeMessage(err)}`, token: a.token, symbol: a.symbol });
      throw err;
    }
    await logEvent(team.owner, { member: "trader", kind: "sent", text: `Sent a ${a.kind} of ${a.symbol}; waiting for the chain to confirm it.`, token: a.token, symbol: a.symbol, hash: err.hash });
    await mutate(api.approvals.recordSent, { owner: team.owner, strategyId: (a.strategyId ?? undefined) as Id<"strategies"> | undefined, kind: a.kind, token: a.token, symbol: a.symbol, amount: a.amount.toString(), reason, hash: err.hash });
    return `${err.hash} (sent, settling)`;
  }
}

/** Take profit and stop loss the owner set on a hand-bought position: sold automatically, as they asked. */
async function handExits() {
  const open = await query(api.book.withExits, {});
  if (!open.length) return [];
  const prices = await getExecutor().prices([...new Set(open.map((p) => p.token))]);
  const peaks = await highs(open, prices, (id) => open.find((p) => p.id === id)!.token);
  const out: string[] = [];
  for (const p of open) {
    const price = prices.get(p.token);
    const entry = Number(p.costWei) / Number(p.tokens);
    const why = price === undefined ? null : exitReason({ takeProfitPct: p.takeProfitPct ?? undefined, stopLossPct: p.stopLossPct ?? undefined, trailingStopPct: p.trailingStopPct ?? undefined }, entry, price, peaks.get(p.id));
    if (!why) continue;
    const reason = `${p.symbol} hit your ${why} (${((price! / entry - 1) * 100).toFixed(0)}%).`;
    await logEvent(p.owner, { member: "trader", kind: "exit", text: reason, token: p.token, symbol: p.symbol });
    const f = await auto((await getTeam(p.owner))!, { kind: "sell", token: p.token, symbol: p.symbol, amount: BigInt(p.tokens), slippageBps: 500, strategyId: null, positionId: p.id, paper: p.paper }, reason, `on your ${why}`);
    out.push(`${p.id}: ${f ? `sold ${p.symbol} (${why})` : "wallet busy"}`);
  }
  return out;
}

/** Trades that were broadcast but not confirmed in time: book them from their receipts once they land. */
async function settle() {
  const ex = getExecutor();
  const out: string[] = [];
  for (const a of await query(api.approvals.sent, {})) {
    const hash = (a.result as { hash?: string } | null)?.hash;
    const team = hash ? await getTeam(a.owner) : null;
    if (!hash || !team) continue;
    const fill = await ex.settle({ hash, token: a.token, wallet: team.wallet, side: a.kind });
    if (fill === null) continue;
    const id = a.id as Id<"approvals">;
    if (fill === "reverted") {
      await mutate(api.approvals.finish, { id, status: "failed", result: { hash, error: "The transaction reverted." } });
    } else if (a.kind === "buy") {
      // the swap carried the amount less the commission; the commission is still to be sent
      const fee = feeOf(BigInt(a.amount));
      await mutate(api.book.bought, { owner: a.owner, strategyId: (a.strategyId ?? undefined) as Id<"strategies"> | undefined, token: a.token, symbol: a.symbol, tokens: fill.tokens.toString(), wei: (fill.wei + fee).toString(), hash });
      await withLease(a.owner, () => chargeFee(team, { side: "buy", token: a.token, wei: fee, tradeHash: hash }));
      await mutate(api.approvals.finish, { id, status: "done", result: { hash, wei: fill.wei.toString(), tokens: fill.tokens.toString() } });
    } else {
      const held = await ex.tokenBalance(team.wallet, a.token);
      const fee = feeOf(fill.wei);
      await mutate(api.book.sold, { owner: a.owner, token: a.token, symbol: a.symbol, tokens: fill.tokens.toString(), wei: (fill.wei - fee).toString(), hash, closes: held === 0n });
      await withLease(a.owner, () => chargeFee(team, { side: "sell", token: a.token, wei: fee, tradeHash: hash }));
      await mutate(api.approvals.finish, { id, status: "done", result: { hash, wei: fill.wei.toString(), tokens: fill.tokens.toString() } });
    }
    if (fill !== "reverted") await logEvent(a.owner, fillEvent(a.kind, a.symbol, a.token, fill, "once it confirmed"));
    out.push(`settled ${a.kind} ${a.symbol} ${hash}`);
  }
  return out;
}

