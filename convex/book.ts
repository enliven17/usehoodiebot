import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { guard, secret } from "./guard";

/** Positions and fills, booked from transaction receipts by the Next server. */
const position = (p: Doc<"positions">) => ({ id: p._id as string, strategyId: (p.strategyId as string | undefined) ?? null, token: p.token, symbol: p.symbol, tokens: p.tokens, costWei: p.costWei, openedAt: p._creationTime });

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
  args: { secret, owner: v.string(), strategyId: v.optional(v.id("strategies")), token: v.string(), symbol: v.string(), tokens: v.string(), wei: v.string(), hash: v.string() },
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
