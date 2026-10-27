import { v } from "convex/values";

import { query } from "./_generated/server";
import { guard, secret } from "./guard";

/**
 * The whole platform at a glance for the admin page: teams, money moved, strategies, what is waiting, and the latest
 * trades and decisions across every team.
 * ponytail: full scans of small tables; counters kept on write once teams or trades run into the thousands.
 */
export const overview = query({
  args: { secret },
  handler: async (ctx, a) => {
    guard(a.secret);
    const [teams, trades, strategies, positions, approvals, events, applications, fees] = await Promise.all([
      ctx.db.query("teams").collect(),
      ctx.db.query("trades").collect(),
      ctx.db.query("strategies").collect(),
      ctx.db.query("positions").collect(),
      ctx.db.query("approvals").withIndex("by_status", (q) => q.eq("status", "pending")).collect(),
      ctx.db.query("events").order("desc").take(60),
      ctx.db.query("applications").collect(),
      ctx.db.query("fees").collect(),
    ]);
    const feeSum = (status: "paid" | "owed") => fees.filter((f) => f.status === status).reduce((t, f) => t + BigInt(f.wei), 0n).toString();
    const volumeWei = trades.reduce((t, x) => t + BigInt(x.wei), 0n);
    const byOwner = new Map<string, { trades: number; volumeWei: bigint; strategies: number; open: number }>();
    const row = (o: string) => byOwner.get(o) ?? byOwner.set(o, { trades: 0, volumeWei: 0n, strategies: 0, open: 0 }).get(o)!;
    for (const t of trades) (row(t.owner).trades++, (row(t.owner).volumeWei += BigInt(t.wei)));
    for (const s of strategies) if (s.active) row(s.owner).strategies++;
    for (const p of positions) if (p.closedAt === undefined) row(p.owner).open++;
    return {
      counts: {
        teams: teams.length,
        trades: trades.length,
        volumeWei: volumeWei.toString(),
        activeStrategies: strategies.filter((s) => s.active).length,
        autoStrategies: strategies.filter((s) => s.active && s.mode === "auto").length,
        openPositions: positions.filter((p) => p.closedAt === undefined).length,
        pendingApprovals: approvals.length,
        feesPaidWei: feeSum("paid"),
        feesOwedWei: feeSum("owed"),
        applications: { pending: applications.filter((x) => x.status === "pending").length, approved: applications.filter((x) => x.status === "approved").length, rejected: applications.filter((x) => x.status === "rejected").length },
      },
      teams: teams
        .sort((x, y) => y._creationTime - x._creationTime)
        .map((t) => {
          const r = byOwner.get(t.owner);
          return { owner: t.owner, wallet: t.wallet, createdAt: t._creationTime, trades: r?.trades ?? 0, volumeWei: (r?.volumeWei ?? 0n).toString(), strategies: r?.strategies ?? 0, open: r?.open ?? 0 };
        }),
      trades: trades
        .sort((x, y) => y._creationTime - x._creationTime)
        .slice(0, 40)
        .map((t) => ({ owner: t.owner, side: t.side, symbol: t.symbol, token: t.token, wei: t.wei, hash: t.hash, at: t._creationTime })),
      events: events.map((e) => ({ owner: e.owner, member: e.member, kind: e.kind, text: e.text, at: e._creationTime })),
    };
  },
});
