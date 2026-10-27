import "server-only";

import { formatEther } from "viem";

import { api, query } from "../db";
import { parseSpec, ruleRows, WATCH_LABEL } from "../strategy";
import { getExecutor, type Team } from "./team";

/** Everything the side panels of the app show, in one call. */
export async function snapshot(team: Team) {
  const ex = getExecutor();
  const owner = team.owner;
  const [open, strategies, approvals, trades, events, closed] = await Promise.all([
    query(api.book.open, { owner }),
    query(api.strategies.byOwner, { owner }),
    query(api.approvals.recent, { owner }),
    query(api.book.trades, { owner }),
    query(api.events.recent, { owner, limit: 40 }),
    query(api.book.closed, { owner }),
  ]);
  const [balance, prices] = await Promise.all([ex.spendable(team.wallet).catch(() => null), ex.prices(open.map((p) => p.token)).catch(() => new Map<string, number>())]);
  const positions = open.map((p) => {
    const price = prices.get(p.token);
    return { id: p.id, token: p.token, symbol: p.symbol, costEth: Number(formatEther(BigInt(p.costWei))), valueEth: price === undefined ? null : (Number(p.tokens) / 1e18) * price, openedAt: p.openedAt };
  });
  const realizedEth = closed.reduce((t, p) => t + Number(formatEther(BigInt(p.proceedsWei) - BigInt(p.costWei))), 0);
  const priced = positions.filter((p) => p.valueEth !== null);
  const unrealizedEth = priced.reduce((t, p) => t + (p.valueEth! - p.costEth), 0);
  return {
    owner,
    wallet: team.wallet,
    spendableEth: balance === null ? null : formatEther(balance),
    positions,
    pnl: { realizedEth, unrealizedEth, closedCount: closed.length },
    events,
    strategies: strategies.map((s) => ({ id: s.id, name: s.name, mode: s.mode, active: s.active, watching: WATCH_LABEL[parseSpec(s.spec).watch], rules: ruleRows(parseSpec(s.spec)) })),
    approvals: approvals.map((a) => ({ id: a.id, kind: a.kind, token: a.token, symbol: a.symbol, eth: a.kind === "buy" ? formatEther(BigInt(a.amount)) : null, reason: a.reason, status: a.status, result: a.result as { hash?: string; error?: string } | null, createdAt: a.createdAt })),
    trades: trades.map((t) => ({ side: t.side, symbol: t.symbol, eth: formatEther(BigInt(t.wei)), hash: t.hash, at: t.at })),
  };
}

export type Snapshot = Awaited<ReturnType<typeof snapshot>>;
