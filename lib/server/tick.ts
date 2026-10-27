import "server-only";

import type { Id } from "@/convex/_generated/dataModel";
import { parseEther } from "viem";

import { candidates, type Candidate } from "../chain/market";
import { api, mutate, query } from "../db";
import { exitReason, parseSpec, rejects, type Spec } from "../strategy";
import { safeMessage } from "./errors";
import { eth, fillEvent, logEvent } from "./events";
import { APPROVAL_TTL_MS, getExecutor, getTeam, propose, SentTrade, trade, tradeNow, type Team } from "./team";

type Strategy = { id: string; owner: string; name: string; spec: unknown; mode: "ask" | "auto" };

/**
 * One pass over every active strategy: at most one new entry per strategy, then exits on open positions.
 * ponytail: sequential over all strategies in one invocation; shard by owner if a tick ever nears the function timeout.
 */
export async function tick() {
  const log: string[] = [];
  await mutate(api.approvals.expire, { ttlMs: APPROVAL_TTL_MS });
  log.push(...(await settle()));
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
  const [open, pending] = await Promise.all([query(api.book.openForStrategy, { strategyId: sid }), query(api.approvals.pending, { owner: s.owner })]);
  if (open.length + pending.filter((a) => a.strategyId === s.id && a.kind === "buy").length >= spec.maxOpen) return [];
  for (const c of await getExecutor().onlyTradable(market.filter((c) => rejects(spec, c) === null))) {
    if (!(await mutate(api.strategies.match, { strategyId: sid, token: c.token }))) continue;
    const wei = parseEther(String(spec.sizeEth));
    const why = `${s.name}: ${c.symbol} matched${c.curvePct !== undefined ? `, ${c.curvePct.toFixed(1)}% up its curve` : ""}${c.mcapUsd !== undefined ? `, $${Math.round(c.mcapUsd).toLocaleString("en-US")} market cap` : ""}.`;
    await logEvent(s.owner, { member: "sniper", kind: "match", text: why, token: c.token, symbol: c.symbol });
    if (s.mode === "ask") {
      await propose(s.owner, { kind: "buy", token: c.token, symbol: c.symbol, amount: wei, reason: why, strategyId: s.id });
      await logEvent(s.owner, { member: "trader", kind: "ask", text: `Asked you to approve a ${eth(wei)} buy of ${c.symbol}.`, token: c.token, symbol: c.symbol });
      return [`${s.id}: asked to buy ${c.symbol}`];
    }
    const f = await auto((await getTeam(s.owner))!, { kind: "buy", token: c.token, symbol: c.symbol, amount: wei, slippageBps: spec.slippageBps, strategyId: s.id }, why);
    if (!f) await mutate(api.strategies.unmatch, { strategyId: sid, token: c.token }); // wallet busy: try it again next tick
    return [`${s.id}: ${f ? `bought ${c.symbol} ${f}` : "wallet busy"}`];
  }
  return [];
}

async function exit(s: Strategy, spec: Spec) {
  if (spec.takeProfitPct === undefined && spec.stopLossPct === undefined) return [];
  const open = await query(api.book.openForStrategy, { strategyId: s.id as Id<"strategies"> });
  if (!open.length) return [];
  const prices = await getExecutor().prices(open.map((p) => p.token));
  const out: string[] = [];
  for (const p of open) {
    const price = prices.get(p.token);
    const entry = Number(p.costWei) / Number(p.tokens); // ETH per whole token: both sides 18 decimals
    const why = price === undefined ? null : exitReason(spec, entry, price);
    if (!why) continue;
    const reason = `${s.name}: ${p.symbol} hit ${why} (${((price! / entry - 1) * 100).toFixed(0)}%).`;
    await logEvent(s.owner, { member: "sniper", kind: "exit", text: reason, token: p.token, symbol: p.symbol });
    if (s.mode === "ask") {
      const pending = await query(api.approvals.pending, { owner: s.owner });
      if (!pending.some((a) => a.token === p.token && a.kind === "sell")) await propose(s.owner, { kind: "sell", token: p.token, symbol: p.symbol, amount: 0n, reason, strategyId: s.id });
      continue;
    }
    // Sell exactly this position, so a manual buy of the same token stays put.
    const f = await auto((await getTeam(s.owner))!, { kind: "sell", token: p.token, symbol: p.symbol, amount: BigInt(p.tokens), slippageBps: spec.slippageBps, strategyId: s.id, positionId: p.id }, reason);
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
      await mutate(api.book.bought, { owner: a.owner, strategyId: (a.strategyId ?? undefined) as Id<"strategies"> | undefined, token: a.token, symbol: a.symbol, tokens: fill.tokens.toString(), wei: fill.wei.toString(), hash });
      await mutate(api.approvals.finish, { id, status: "done", result: { hash, wei: fill.wei.toString(), tokens: fill.tokens.toString() } });
    } else {
      const held = await ex.tokenBalance(team.wallet, a.token);
      await mutate(api.book.sold, { owner: a.owner, token: a.token, symbol: a.symbol, tokens: fill.tokens.toString(), wei: fill.wei.toString(), hash, closes: held === 0n });
      await mutate(api.approvals.finish, { id, status: "done", result: { hash, wei: fill.wei.toString(), tokens: fill.tokens.toString() } });
    }
    if (fill !== "reverted") await logEvent(a.owner, fillEvent(a.kind, a.symbol, a.token, fill, "once it confirmed"));
    out.push(`settled ${a.kind} ${a.symbol} ${hash}`);
  }
  return out;
}

