import "server-only";

import { parseEther } from "viem";

import { candidates } from "../chain/market";
import { sql } from "../db";
import { exitReason, parseSpec, rejects, type Spec } from "../strategy";
import { APPROVAL_TTL_MIN, getExecutor, getTeam, propose, tradeNow, type Position } from "./team";

type Row = { id: string; owner: string; name: string; spec: unknown; mode: "ask" | "auto" };

/**
 * One pass over every active strategy: at most one new entry per strategy, then exits on open positions.
 * ponytail: sequential over all strategies in one invocation; shard by owner if a tick ever nears the function timeout.
 */
export async function tick() {
  const log: string[] = [];
  await sql`update approvals set status = 'expired' where status = 'pending' and created_at < now() - make_interval(mins => ${APPROVAL_TTL_MIN})`;
  const strategies = await sql<Row>`select id, owner, name, spec, mode from strategies where active`;
  if (!strategies.length) return log;
  const market = await candidates();
  const ex = getExecutor();

  for (const s of strategies) {
    const spec = parseSpec(s.spec);
    try {
      log.push(...(await enter(s, spec, market, ex)), ...(await exit(s, spec, ex)));
    } catch (err) {
      log.push(`${s.id}: ${err instanceof Error ? err.message.slice(0, 160) : String(err)}`);
    }
  }
  return log;
}

async function enter(s: Row, spec: Spec, market: Awaited<ReturnType<typeof candidates>>, ex: ReturnType<typeof getExecutor>) {
  const [{ open }] = (await sql<{ open: number }>`select count(*)::int as open from positions where strategy_id = ${s.id} and closed_at is null`) as [{ open: number }];
  const [{ pending }] = (await sql<{ pending: number }>`select count(*)::int as pending from approvals where strategy_id = ${s.id} and status = 'pending' and kind = 'buy'`) as [{ pending: number }];
  if (open + pending >= spec.maxOpen) return [];
  const passing = market.filter((c) => rejects(spec, c) === null);
  for (const c of await ex.onlyTradable(passing)) {
    const [fresh] = await sql`insert into matches (strategy_id, token) values (${s.id}, ${c.token}) on conflict do nothing returning token`;
    if (!fresh) continue;
    const wei = parseEther(String(spec.sizeEth));
    const why = `${s.name}: ${c.symbol} matched${c.curvePct !== undefined ? `, ${c.curvePct.toFixed(1)}% up its curve` : ""}${c.mcapUsd !== undefined ? `, $${Math.round(c.mcapUsd).toLocaleString("en-US")} market cap` : ""}.`;
    if (s.mode === "ask") {
      await propose(s.owner, { kind: "buy", token: c.token, symbol: c.symbol, amount: wei, reason: why, strategyId: s.id });
      return [`${s.id}: asked to buy ${c.symbol}`];
    }
    const team = (await getTeam(s.owner))!;
    const f = await tradeNow(team, { kind: "buy", token: c.token, symbol: c.symbol, amount: wei, slippageBps: spec.slippageBps, strategyId: s.id });
    if (!f) await sql`delete from matches where strategy_id = ${s.id} and token = ${c.token}`; // wallet busy: try it again next tick
    return [`${s.id}: ${f ? `bought ${c.symbol} ${f.hash}` : "wallet busy"}`];
  }
  return [];
}

async function exit(s: Row, spec: Spec, ex: ReturnType<typeof getExecutor>) {
  if (spec.takeProfitPct === undefined && spec.stopLossPct === undefined) return [];
  const open = await sql<Position>`select id, token, symbol, tokens, cost_wei from positions where strategy_id = ${s.id} and closed_at is null`;
  if (!open.length) return [];
  const prices = await ex.prices(open.map((p) => p.token));
  const out: string[] = [];
  for (const p of open) {
    const price = prices.get(p.token);
    const entry = Number(p.cost_wei) / Number(p.tokens); // ETH per whole token: both 18 decimals
    const why = price === undefined ? null : exitReason(spec, entry, price);
    if (!why) continue;
    const reason = `${s.name}: ${p.symbol} hit ${why} (${(((price! / entry) - 1) * 100).toFixed(0)}%).`;
    if (s.mode === "ask") {
      const [already] = await sql`select 1 from approvals where owner = ${s.owner} and token = ${p.token} and kind = 'sell' and status = 'pending'`;
      if (!already) await propose(s.owner, { kind: "sell", token: p.token, symbol: p.symbol, amount: 0n, reason, strategyId: s.id });
      continue;
    }
    const f = await tradeNow((await getTeam(s.owner))!, { kind: "sell", token: p.token, symbol: p.symbol, amount: 0n, slippageBps: spec.slippageBps, strategyId: s.id });
    out.push(`${s.id}: ${f ? `sold ${p.symbol} (${why})` : "wallet busy"}`);
  }
  return out;
}
