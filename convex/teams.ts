import { v } from "convex/values";

import { mutation, query, type DatabaseReader } from "./_generated/server";
import { guard, secret } from "./guard";

const byOwner = (db: DatabaseReader, owner: string) =>
  db.query("teams").withIndex("by_owner", (q) => q.eq("owner", owner)).unique();

export const get = query({
  args: { secret, owner: v.string() },
  handler: async (ctx, a) => {
    guard(a.secret);
    return await byOwner(ctx.db, a.owner);
  },
});

/** First writer wins: a second call for the same owner returns the existing team. */
export const create = mutation({
  args: { secret, owner: v.string(), wallet: v.string(), walletId: v.string(), policyId: v.string() },
  handler: async (ctx, { secret: s, ...t }) => {
    guard(s);
    const existing = await byOwner(ctx.db, t.owner);
    if (existing) return existing;
    const id = await ctx.db.insert("teams", { ...t, thread: 0 });
    return (await ctx.db.get(id))!;
  },
});

/** Takes the wallet lease for `seconds`, or returns false while another transaction holds it. */
export const lease = mutation({
  args: { secret, owner: v.string(), seconds: v.number() },
  handler: async (ctx, a) => {
    guard(a.secret);
    const t = await byOwner(ctx.db, a.owner);
    if (!t || (t.busyUntil ?? 0) > Date.now()) return false;
    await ctx.db.patch(t._id, { busyUntil: Date.now() + a.seconds * 1000 });
    return true;
  },
});

export const release = mutation({
  args: { secret, owner: v.string() },
  handler: async (ctx, a) => {
    guard(a.secret);
    const t = await byOwner(ctx.db, a.owner);
    if (t) await ctx.db.patch(t._id, { busyUntil: undefined });
  },
});

export const newThread = mutation({
  args: { secret, owner: v.string() },
  handler: async (ctx, a) => {
    guard(a.secret);
    const t = await byOwner(ctx.db, a.owner);
    if (!t) return 0;
    await ctx.db.patch(t._id, { thread: t.thread + 1 });
    return t.thread + 1;
  },
});
