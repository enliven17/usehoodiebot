import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { guard, secret } from "./guard";

/** Every commission taken: paid with its transfer hash, or owed until the tick manages to send it. */
export const record = mutation({
  args: { secret, owner: v.string(), side: v.union(v.literal("buy"), v.literal("sell")), token: v.string(), wei: v.string(), tradeHash: v.string(), hash: v.optional(v.string()) },
  handler: async (ctx, { secret: s, hash, ...f }) => {
    guard(s);
    await ctx.db.insert("fees", { ...f, status: hash ? "paid" : "owed", hash });
  },
});

export const owed = query({
  args: { secret },
  handler: async (ctx, a) => {
    guard(a.secret);
    return (await ctx.db.query("fees").withIndex("by_status", (q) => q.eq("status", "owed")).take(50)).map((f) => ({ id: f._id as string, owner: f.owner, wei: f.wei }));
  },
});

export const paid = mutation({
  args: { secret, id: v.id("fees"), hash: v.string() },
  handler: async (ctx, a) => {
    guard(a.secret);
    await ctx.db.patch(a.id, { status: "paid", hash: a.hash });
  },
});
