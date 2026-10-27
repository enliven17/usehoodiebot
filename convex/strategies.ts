import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { guard, secret } from "./guard";

const mode = v.union(v.literal("ask"), v.literal("auto"));
const shape = (s: { _id: string; owner: string; name: string; spec: unknown; mode: "ask" | "auto"; active: boolean }) => ({ id: s._id as string, owner: s.owner, name: s.name, spec: s.spec, mode: s.mode, active: s.active });

export const byOwner = query({
  args: { secret, owner: v.string() },
  handler: async (ctx, a) => {
    guard(a.secret);
    return (await ctx.db.query("strategies").withIndex("by_owner", (q) => q.eq("owner", a.owner)).order("desc").collect()).map(shape);
  },
});

export const active = query({
  args: { secret },
  handler: async (ctx, a) => {
    guard(a.secret);
    return (await ctx.db.query("strategies").withIndex("by_active", (q) => q.eq("active", true)).collect()).map(shape);
  },
});

/** At most `limit` running per owner. Returns the id, or null when the owner is at the limit. */
export const create = mutation({
  args: { secret, owner: v.string(), name: v.string(), spec: v.any(), mode, limit: v.number() },
  handler: async (ctx, { secret: s, limit, ...st }) => {
    guard(s);
    const running = (await ctx.db.query("strategies").withIndex("by_owner", (q) => q.eq("owner", st.owner)).collect()).filter((x) => x.active).length;
    if (running >= limit) return null;
    return (await ctx.db.insert("strategies", { ...st, active: true })) as string;
  },
});

export const update = mutation({
  args: { secret, owner: v.string(), id: v.string(), active: v.optional(v.boolean()), mode: v.optional(mode) },
  handler: async (ctx, a) => {
    guard(a.secret);
    const id = ctx.db.normalizeId("strategies", a.id);
    const st = id && (await ctx.db.get(id));
    if (!st || st.owner !== a.owner) return false;
    await ctx.db.patch(st._id, { ...(a.active !== undefined ? { active: a.active } : {}), ...(a.mode ? { mode: a.mode } : {}) });
    return true;
  },
});

export const remove = mutation({
  args: { secret, owner: v.string(), id: v.string() },
  handler: async (ctx, a) => {
    guard(a.secret);
    const id = ctx.db.normalizeId("strategies", a.id);
    const st = id && (await ctx.db.get(id));
    if (st && st.owner === a.owner) await ctx.db.delete(st._id);
  },
});

/** Records the match; false when this strategy already matched the token. */
export const match = mutation({
  args: { secret, strategyId: v.id("strategies"), token: v.string() },
  handler: async (ctx, a) => {
    guard(a.secret);
    const seen = await ctx.db.query("matches").withIndex("by_strategy_token", (q) => q.eq("strategyId", a.strategyId).eq("token", a.token)).unique();
    if (seen) return false;
    await ctx.db.insert("matches", { strategyId: a.strategyId, token: a.token });
    return true;
  },
});

export const unmatch = mutation({
  args: { secret, strategyId: v.id("strategies"), token: v.string() },
  handler: async (ctx, a) => {
    guard(a.secret);
    const seen = await ctx.db.query("matches").withIndex("by_strategy_token", (q) => q.eq("strategyId", a.strategyId).eq("token", a.token)).unique();
    if (seen) await ctx.db.delete(seen._id);
  },
});
