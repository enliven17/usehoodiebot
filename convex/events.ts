import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { guard, secret } from "./guard";

const member = v.union(v.literal("hoodiebot"), v.literal("research"), v.literal("sniper"), v.literal("trader"), v.literal("launch"), v.literal("shield"));

export const log = mutation({
  args: { secret, owner: v.string(), member, kind: v.string(), text: v.string(), token: v.optional(v.string()), symbol: v.optional(v.string()), hash: v.optional(v.string()), wei: v.optional(v.string()) },
  handler: async (ctx, { secret: s, ...e }) => {
    guard(s);
    await ctx.db.insert("events", { ...e, text: e.text.slice(0, 280) });
  },
});

export const recent = query({
  args: { secret, owner: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, a) => {
    guard(a.secret);
    const rows = await ctx.db.query("events").withIndex("by_owner", (q) => q.eq("owner", a.owner)).order("desc").take(Math.min(100, a.limit ?? 40));
    return rows.map((e) => ({ id: e._id as string, at: e._creationTime, member: e.member, kind: e.kind, text: e.text, token: e.token ?? null, symbol: e.symbol ?? null, hash: e.hash ?? null, wei: e.wei ?? null }));
  },
});
