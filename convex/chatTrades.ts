import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { guard, secret } from "./guard";

/** Card id to transaction, for the cards this owner has confirmed. */
export const done = query({
  args: { secret, owner: v.string() },
  handler: async (ctx, a) => {
    guard(a.secret);
    const rows = await ctx.db.query("chatTrades").withIndex("by_owner", (q) => q.eq("owner", a.owner)).take(500);
    return Object.fromEntries(rows.map((r) => [r.cardId, r.hash]));
  },
});

/** Claims a card before its trade; false when it was already used. */
export const claim = mutation({
  args: { secret, owner: v.string(), cardId: v.string() },
  handler: async (ctx, a) => {
    guard(a.secret);
    const used = await ctx.db.query("chatTrades").withIndex("by_owner", (q) => q.eq("owner", a.owner).eq("cardId", a.cardId)).unique();
    if (used) return false;
    await ctx.db.insert("chatTrades", { owner: a.owner, cardId: a.cardId, hash: "pending" });
    return true;
  },
});

/** The card's fill, or its release when the trade did not go through. */
export const settle = mutation({
  args: { secret, owner: v.string(), cardId: v.string(), hash: v.optional(v.string()) },
  handler: async (ctx, a) => {
    guard(a.secret);
    const row = await ctx.db.query("chatTrades").withIndex("by_owner", (q) => q.eq("owner", a.owner).eq("cardId", a.cardId)).unique();
    if (!row) return;
    if (a.hash) await ctx.db.patch(row._id, { hash: a.hash });
    else await ctx.db.delete(row._id);
  },
});
