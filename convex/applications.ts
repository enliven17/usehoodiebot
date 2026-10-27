import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { guard, secret } from "./guard";

const shape = (a: Doc<"applications">) => ({ id: a._id as string, owner: a.owner, answers: a.answers as Record<string, unknown>, status: a.status, submittedAt: a._creationTime, decidedAt: a.decidedAt ?? null, decidedBy: a.decidedBy ?? null });

export const get = query({
  args: { secret, owner: v.string() },
  handler: async (ctx, a) => {
    guard(a.secret);
    const row = await ctx.db.query("applications").withIndex("by_owner", (q) => q.eq("owner", a.owner)).unique();
    return row ? shape(row) : null;
  },
});

/** One application per owner: a second submit returns the first, untouched. */
export const submit = mutation({
  args: { secret, owner: v.string(), answers: v.any() },
  handler: async (ctx, a) => {
    guard(a.secret);
    const existing = await ctx.db.query("applications").withIndex("by_owner", (q) => q.eq("owner", a.owner)).unique();
    if (existing) return shape(existing);
    const id = await ctx.db.insert("applications", { owner: a.owner, answers: a.answers, status: "pending" });
    return shape((await ctx.db.get(id))!);
  },
});

/** Every application, newest first. */
export const list = query({
  args: { secret },
  handler: async (ctx, a) => {
    guard(a.secret);
    return (await ctx.db.query("applications").order("desc").take(1000)).map(shape);
  },
});

export const decide = mutation({
  args: { secret, id: v.id("applications"), status: v.union(v.literal("approved"), v.literal("rejected"), v.literal("pending")), by: v.string() },
  handler: async (ctx, a) => {
    guard(a.secret);
    const row = await ctx.db.get(a.id);
    if (!row) return null;
    await ctx.db.patch(a.id, { status: a.status, decidedAt: Date.now(), decidedBy: a.by });
    return shape((await ctx.db.get(a.id))!);
  },
});
