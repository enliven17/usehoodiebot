import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { guard, secret } from "./guard";

const kind = v.union(v.literal("buy"), v.literal("sell"));
export const shape = (a: Doc<"approvals">) => ({
  id: a._id as string, owner: a.owner, strategyId: (a.strategyId as string | undefined) ?? null, kind: a.kind, token: a.token, symbol: a.symbol,
  amount: a.amount, reason: a.reason, status: a.status, result: a.result ?? null, createdAt: a._creationTime, decidedAt: a.decidedAt ?? null,
});

export const propose = mutation({
  args: { secret, owner: v.string(), strategyId: v.optional(v.id("strategies")), kind, token: v.string(), symbol: v.string(), amount: v.string(), reason: v.string() },
  handler: async (ctx, { secret: s, ...a }) => {
    guard(s);
    return shape((await ctx.db.get(await ctx.db.insert("approvals", { ...a, status: "pending" })))!);
  },
});

/** The owner's yes or no, only while pending and fresh: a double click or a stale card never trades. */
export const claim = mutation({
  args: { secret, owner: v.string(), id: v.string(), approve: v.boolean(), ttlMs: v.number() },
  handler: async (ctx, a) => {
    guard(a.secret);
    const id = ctx.db.normalizeId("approvals", a.id);
    const row = id && (await ctx.db.get(id));
    if (!row || row.owner !== a.owner || row.status !== "pending" || row._creationTime < Date.now() - a.ttlMs) return null;
    await ctx.db.patch(row._id, { status: a.approve ? "approved" : "skipped", decidedAt: Date.now() });
    return shape((await ctx.db.get(row._id))!);
  },
});

export const finish = mutation({
  args: { secret, id: v.id("approvals"), status: v.union(v.literal("done"), v.literal("failed")), result: v.any() },
  handler: async (ctx, a) => {
    guard(a.secret);
    await ctx.db.patch(a.id, { status: a.status, result: a.result });
    return shape((await ctx.db.get(a.id))!);
  },
});

export const expire = mutation({
  args: { secret, ttlMs: v.number() },
  handler: async (ctx, a) => {
    guard(a.secret);
    const cutoff = Date.now() - a.ttlMs;
    for (const r of await ctx.db.query("approvals").withIndex("by_status", (q) => q.eq("status", "pending")).collect()) {
      if (r._creationTime < cutoff) await ctx.db.patch(r._id, { status: "expired" });
    }
  },
});

/** Pending ones and those decided in the last hour, newest first. */
export const recent = query({
  args: { secret, owner: v.string() },
  handler: async (ctx, a) => {
    guard(a.secret);
    const hour = Date.now() - 3600_000;
    const rows = await ctx.db.query("approvals").withIndex("by_owner", (q) => q.eq("owner", a.owner)).order("desc").take(50);
    return rows.filter((r) => r.status === "pending" || (r.decidedAt ?? r._creationTime) > hour).slice(0, 20).map(shape);
  },
});

export const pending = query({
  args: { secret, owner: v.string() },
  handler: async (ctx, a) => {
    guard(a.secret);
    return (await ctx.db.query("approvals").withIndex("by_owner", (q) => q.eq("owner", a.owner)).order("desc").take(100)).filter((r) => r.status === "pending").map(shape);
  },
});
