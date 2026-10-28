import "server-only";

import { formatEther } from "viem";

import { api, query } from "../db";
import { parseSpec, ruleRows, WATCH_LABEL } from "../strategy";
import { journal } from "../journal";
import { MEMBERS, type Member } from "../team";
import { getExecutor, type Team } from "./team";
import { autoDeployed } from "./tick";

const DAY_MS = 24 * 3600_000;

/** Everything the side panels of the app show, in one call. */
export async function snapshot(team: Team) {
  const ex = getExecutor();
  const owner = team.owner;
  const paper = team.mode === "paper";
  const [open, strategies, approvals, trades, events, closed] = await Promise.all([
    query(api.book.open, { owner, paper }),
    query(api.strategies.byOwner, { owner }),
    query(api.approvals.recent, { owner }),
    query(api.book.trades, { owner, paper }),
    query(api.events.recent, { owner, limit: 100 }),
    query(api.book.closed, { owner, paper }),
  ]);
  const memories = await query(api.memories.list, { owner });
  // on paper the balance is the paper one; the wallet's own ETH is shown beside it
  const [balance, prices, deployedEth] = await Promise.all([paper ? Promise.resolve(team.paperWei) : ex.spendable(team.wallet).catch(() => null), ex.prices(open.map((p) => p.token)).catch(() => new Map<string, number>()), autoDeployed(owner).catch(() => 0)]);
  // what each specialist did last, and how much of it in the last day
  const day = events.filter((e) => e.at > Date.now() - DAY_MS);
  const agents = Object.fromEntries(
    MEMBERS.map((m) => {
      const mine = events.filter((e) => e.member === m);
      const kinds = day.filter((e) => e.member === m).reduce<Record<string, number>>((t, e) => ({ ...t, [e.kind]: (t[e.kind] ?? 0) + 1 }), {});
      return [m, { last: mine[0] ? { text: mine[0].text, at: mine[0].at } : null, today: kinds }];
    }),
  ) as Record<Member, { last: { text: string; at: number } | null; today: Record<string, number> }>;
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
    mode: team.mode,
    positions,
    pnl: { realizedEth, unrealizedEth, closedCount: closed.length },
    events: events.slice(0, 40),
    agents,
    memories,
    journal: journal(closed.map((p) => ({ symbol: p.symbol, costEth: Number(formatEther(BigInt(p.costWei))), proceedsEth: Number(formatEther(BigInt(p.proceedsWei))), openedAt: p.openedAt, closedAt: p.closedAt, byStrategy: p.byStrategy }))),
    autopilot: { ...team.autopilot, deployedEth },
    strategies: strategies.map((s) => ({ id: s.id, name: s.name, mode: s.mode, active: s.active, watching: WATCH_LABEL[parseSpec(s.spec).watch], rules: ruleRows(parseSpec(s.spec)) })),
    approvals: approvals.map((a) => ({ id: a.id, kind: a.kind, token: a.token, symbol: a.symbol, eth: a.kind === "buy" ? formatEther(BigInt(a.amount)) : null, reason: a.reason, status: a.status, result: a.result as { hash?: string; error?: string } | null, createdAt: a.createdAt })),
    trades: trades.map((t) => ({ side: t.side, symbol: t.symbol, eth: formatEther(BigInt(t.wei)), hash: t.hash, at: t.at })),
  };
}

export type Snapshot = Awaited<ReturnType<typeof snapshot>>;
