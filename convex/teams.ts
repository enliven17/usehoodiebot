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

/** Takes the wallet lease for `seconds` under `token`, or returns false while another transaction holds it. */
export const lease = mutation({
  args: { secret, owner: v.string(), seconds: v.number(), token: v.string() },
  handler: async (ctx, a) => {
    guard(a.secret);
    const t = await byOwner(ctx.db, a.owner);
    if (!t || (t.busyUntil ?? 0) > Date.now()) return false;
    await ctx.db.patch(t._id, { busyUntil: Date.now() + a.seconds * 1000, busyToken: a.token });
    return true;
  },
});

/** Releases only the caller's own lease. */
export const release = mutation({
  args: { secret, owner: v.string(), token: v.string() },
  handler: async (ctx, a) => {
    guard(a.secret);
    const t = await byOwner(ctx.db, a.owner);
    if (t && t.busyToken === a.token) await ctx.db.patch(t._id, { busyUntil: undefined, busyToken: undefined });
  },
});

/** Starts a chat past every thread used so far; an open chat with nothing in it is kept instead. */
export const newThread = mutation({
  args: { secret, owner: v.string() },
  handler: async (ctx, a) => {
    guard(a.secret);
    const t = await byOwner(ctx.db, a.owner);
    if (!t) return 0;
    const used = await ctx.db.query("messages").withIndex("by_thread", (q) => q.eq("owner", a.owner).eq("thread", t.thread)).first();
    if (!used) return t.thread;
    const next = Math.max(t.thread, t.lastThread ?? 0) + 1;
    await ctx.db.patch(t._id, { thread: next, lastThread: next });
    return next;
  },
});

/** Reopens an earlier chat; new messages carry on in it. */
export const openThread = mutation({
  args: { secret, owner: v.string(), thread: v.number() },
  handler: async (ctx, a) => {
    guard(a.secret);
    const t = await byOwner(ctx.db, a.owner);
    const last = Math.max(t?.thread ?? 0, t?.lastThread ?? 0);
    if (!t || !Number.isInteger(a.thread) || a.thread < 0 || a.thread > last) return false;
    await ctx.db.patch(t._id, { thread: a.thread, lastThread: last });
    return true;
  },
});
