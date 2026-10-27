import "server-only";

import type { Id } from "@/convex/_generated/dataModel";
import { parseEther } from "viem";

import { candidates, type Candidate } from "../chain/market";
import { api, mutate, query } from "../db";
import { exitReason, parseSpec, rejects, type Spec } from "../strategy";
import { APPROVAL_TTL_MS, getExecutor, getTeam, propose, tradeNow } from "./team";

type Strategy = { id: string; owner: string; name: string; spec: unknown; mode: "ask" | "auto" };

/**
 * One pass over every active strategy: at most one new entry per strategy, then exits on open positions.
 * ponytail: sequential over all strategies in one invocation; shard by owner if a tick ever nears the function timeout.
 */
export async function tick() {
  const log: string[] = [];
  await mutate(api.approvals.expire, { ttlMs: APPROVAL_TTL_MS });
  const strategies = await query(api.strategies.active, {});
  if (!strategies.length) return log;
  const market = await candidates();
  for (const s of strategies) {
    const spec = parseSpec(s.spec);
    try {
      log.push(...(await enter(s, spec, market)), ...(await exit(s, spec)));
    } catch (err) {
      log.push(`${s.id}: ${err instanceof Error ? err.message.slice(0, 160) : String(err)}`);
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
    if (s.mode === "ask") {
      await propose(s.owner, { kind: "buy", token: c.token, symbol: c.symbol, amount: wei, reason: why, strategyId: s.id });
      return [`${s.id}: asked to buy ${c.symbol}`];
    }
    const f = await tradeNow((await getTeam(s.owner))!, { kind: "buy", token: c.token, symbol: c.symbol, amount: wei, slippageBps: spec.slippageBps, strategyId: s.id });
    if (!f) await mutate(api.strategies.unmatch, { strategyId: sid, token: c.token }); // wallet busy: try it again next tick
    return [`${s.id}: ${f ? `bought ${c.symbol} ${f.hash}` : "wallet busy"}`];
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
    if (s.mode === "ask") {
      const pending = await query(api.approvals.pending, { owner: s.owner });
      if (!pending.some((a) => a.token === p.token && a.kind === "sell")) await propose(s.owner, { kind: "sell", token: p.token, symbol: p.symbol, amount: 0n, reason, strategyId: s.id });
      continue;
    }
    const f = await tradeNow((await getTeam(s.owner))!, { kind: "sell", token: p.token, symbol: p.symbol, amount: 0n, slippageBps: spec.slippageBps, strategyId: s.id });
    out.push(`${s.id}: ${f ? `sold ${p.symbol} (${why})` : "wallet busy"}`);
  }
  return out;
}
