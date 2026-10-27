import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { guard, secret } from "./guard";

/** Positions and fills, booked from transaction receipts by the Next server. */
const position = (p: Doc<"positions">) => ({ id: p._id as string, owner: p.owner, strategyId: (p.strategyId as string | undefined) ?? null, token: p.token, symbol: p.symbol, tokens: p.tokens, costWei: p.costWei, openedAt: p._creationTime, takeProfitPct: p.takeProfitPct ?? null, stopLossPct: p.stopLossPct ?? null, trailingStopPct: p.trailingStopPct ?? null, peakEth: p.peakEth ?? null });

export const open = query({
  args: { secret, owner: v.string() },
  handler: async (ctx, a) => {
    guard(a.secret);
    return (await ctx.db.query("positions").withIndex("by_owner_open", (q) => q.eq("owner", a.owner).eq("closedAt", undefined)).order("desc").collect()).map(position);
  },
});

export const openForStrategy = query({
  args: { secret, strategyId: v.id("strategies") },
  handler: async (ctx, a) => {
    guard(a.secret);
    return (await ctx.db.query("positions").withIndex("by_strategy_open", (q) => q.eq("strategyId", a.strategyId).eq("closedAt", undefined)).collect()).map(position);
  },
});

export const bought = mutation({
  args: { secret, owner: v.string(), strategyId: v.optional(v.id("strategies")), token: v.string(), symbol: v.string(), tokens: v.string(), wei: v.string(), hash: v.string(), takeProfitPct: v.optional(v.number()), stopLossPct: v.optional(v.number()), trailingStopPct: v.optional(v.number()) },
  handler: async (ctx, { secret: s, wei, hash, ...p }) => {
    guard(s);
    await ctx.db.insert("positions", { ...p, costWei: wei });
    await ctx.db.insert("trades", { owner: p.owner, side: "buy", token: p.token, symbol: p.symbol, wei, tokens: p.tokens, hash });
  },
});

/**
 * A sell. It closes `positionId` when given (a strategy exit sells exactly that position), and every open position in
 * the token when `closes` (the wallet holds none of it any more).
 */
export const sold = mutation({
  args: { secret, owner: v.string(), token: v.string(), symbol: v.string(), tokens: v.string(), wei: v.string(), hash: v.string(), closes: v.boolean(), positionId: v.optional(v.string()) },
  handler: async (ctx, a) => {
    guard(a.secret);
    await ctx.db.insert("trades", { owner: a.owner, side: "sell", token: a.token, symbol: a.symbol, wei: a.wei, tokens: a.tokens, hash: a.hash });
    const open = (await ctx.db.query("positions").withIndex("by_owner_open", (q) => q.eq("owner", a.owner).eq("closedAt", undefined)).collect()).filter((p) => p.token === a.token);
    for (const p of open) {
      if (a.closes || p._id === a.positionId) await ctx.db.patch(p._id, { closedAt: Date.now(), proceedsWei: a.closes && p._id !== a.positionId ? "0" : a.wei });
    }
  },
});

/** Closed positions, newest first: realized profit and loss. */
export const closed = query({
  args: { secret, owner: v.string() },
  handler: async (ctx, a) => {
    guard(a.secret);
    const rows = await ctx.db.query("positions").withIndex("by_owner_open", (q) => q.eq("owner", a.owner).gt("closedAt", 0)).collect();
    return rows.map((p) => ({ symbol: p.symbol, costWei: p.costWei, proceedsWei: p.proceedsWei ?? "0", closedAt: p.closedAt! }));
  },
});

export const trades = query({
  args: { secret, owner: v.string() },
  handler: async (ctx, a) => {
    guard(a.secret);
    return (await ctx.db.query("trades").withIndex("by_owner", (q) => q.eq("owner", a.owner)).order("desc").take(20)).map((t) => ({ side: t.side, symbol: t.symbol, wei: t.wei, hash: t.hash, at: t._creationTime }));
  },
});

/** Every fill in one token, oldest first: the buy and sell marks on its chart. */
export const tradesFor = query({
  args: { secret, owner: v.string(), token: v.string() },
  handler: async (ctx, a) => {
    guard(a.secret);
    const rows = await ctx.db.query("trades").withIndex("by_owner_token", (q) => q.eq("owner", a.owner).eq("token", a.token)).take(200);
    return rows.map((t) => ({ side: t.side, wei: t.wei, tokens: t.tokens, hash: t.hash, at: t._creationTime }));
  },
});

/** Tokens the team has traded, newest first, one row each. */
export const tradedTokens = query({
  args: { secret, owner: v.string() },
  handler: async (ctx, a) => {
    guard(a.secret);
    const rows = await ctx.db.query("trades").withIndex("by_owner", (q) => q.eq("owner", a.owner)).order("desc").take(200);
    const seen = new Set<string>();
    return rows.filter((t) => !seen.has(t.token) && seen.add(t.token)).map((t) => ({ token: t.token, symbol: t.symbol, at: t._creationTime }));
  },
});

/** Sets (or clears, with undefined) the exits on the owner's open hand-bought positions in a token. */
export const setExits = mutation({
  args: { secret, owner: v.string(), token: v.string(), takeProfitPct: v.optional(v.number()), stopLossPct: v.optional(v.number()), trailingStopPct: v.optional(v.number()) },
  handler: async (ctx, a) => {
    guard(a.secret);
    const open = (await ctx.db.query("positions").withIndex("by_owner_open", (q) => q.eq("owner", a.owner).eq("closedAt", undefined)).collect()).filter((p) => p.token === a.token && !p.strategyId);
    for (const p of open) await ctx.db.patch(p._id, { takeProfitPct: a.takeProfitPct, stopLossPct: a.stopLossPct, trailingStopPct: a.trailingStopPct });
    return open.length;
  },
});

/** Every open position with an exit the owner set, across owners: the tick watches these. */
export const withExits = query({
  args: { secret },
  handler: async (ctx, a) => {
    guard(a.secret);
    const open = await ctx.db.query("positions").withIndex("by_open", (q) => q.eq("closedAt", undefined)).take(500);
    return open.filter((p) => p.takeProfitPct !== undefined || p.stopLossPct !== undefined || p.trailingStopPct !== undefined).map(position);
  },
});

/** Raises a position's recorded high; a lower price leaves it alone. */
export const peak = mutation({
  args: { secret, id: v.id("positions"), priceEth: v.number() },
  handler: async (ctx, a) => {
    guard(a.secret);
    const p = await ctx.db.get(a.id);
    if (p && p.closedAt === undefined && a.priceEth > (p.peakEth ?? 0)) await ctx.db.patch(a.id, { peakEth: a.priceEth });
  },
});
