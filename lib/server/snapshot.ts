import "server-only";

import { formatEther } from "viem";

import { sql } from "../db";
import { describe, parseSpec, WATCH_LABEL } from "../strategy";
import { getExecutor, type Approval, type Position, type Team } from "./team";

/** Everything the side panels of the app show, in one call. */
export async function snapshot(team: Team) {
  const ex = getExecutor();
  const [open, strategies, approvals, trades] = await Promise.all([
    sql<Position>`select id, strategy_id, token, symbol, tokens, cost_wei, opened_at from positions where owner = ${team.owner} and closed_at is null order by opened_at desc`,
    sql<{ id: string; name: string; spec: unknown; mode: string; active: boolean }>`select id, name, spec, mode, active from strategies where owner = ${team.owner} order by created_at desc`,
    sql<Approval>`select * from approvals where owner = ${team.owner} and (status = 'pending' or decided_at > now() - interval '1 hour') order by created_at desc limit 20`,
    sql<{ side: string; symbol: string; wei: string; hash: string; created_at: string }>`select side, symbol, wei, hash, created_at from trades where owner = ${team.owner} order by id desc limit 20`,
  ]);
  const [balance, prices] = await Promise.all([ex.spendable(team.wallet).catch(() => null), ex.prices(open.map((p) => p.token)).catch(() => new Map<string, number>())]);
  return {
    owner: team.owner,
    wallet: team.wallet,
    spendableEth: balance === null ? null : formatEther(balance),
    positions: open.map((p) => {
      const price = prices.get(p.token);
      return { id: p.id, token: p.token, symbol: p.symbol, costEth: Number(formatEther(BigInt(p.cost_wei))), valueEth: price === undefined ? null : (Number(p.tokens) / 1e18) * price };
    }),
    strategies: strategies.map((s) => ({ id: s.id, name: s.name, mode: s.mode, active: s.active, watching: WATCH_LABEL[parseSpec(s.spec).watch], rules: describe(parseSpec(s.spec)) })),
    approvals: approvals.map((a) => ({ id: a.id, kind: a.kind, token: a.token, symbol: a.symbol, eth: a.kind === "buy" ? formatEther(BigInt(a.amount)) : null, reason: a.reason, status: a.status, result: a.result as { hash?: string; error?: string } | null, createdAt: a.created_at })),
    trades: trades.map((t) => ({ side: t.side, symbol: t.symbol, eth: formatEther(BigInt(t.wei)), hash: t.hash, at: t.created_at })),
  };
}

export type Snapshot = Awaited<ReturnType<typeof snapshot>>;
