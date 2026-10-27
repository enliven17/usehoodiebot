import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { guard, secret } from "./guard";

/** The open thread, oldest first. */
export const thread = query({
  args: { secret, owner: v.string() },
  handler: async (ctx, a) => {
    guard(a.secret);
    const team = await ctx.db.query("teams").withIndex("by_owner", (q) => q.eq("owner", a.owner)).unique();
    if (!team) return { thread: 0, rows: [] };
    const rows = await ctx.db.query("messages").withIndex("by_thread", (q) => q.eq("owner", a.owner).eq("thread", team.thread)).collect();
    return { thread: team.thread, rows: rows.map((r) => ({ id: r._id as string, role: r.role, content: JSON.parse(r.content) as unknown })) };
  },
});

export const append = mutation({
  args: { secret, owner: v.string(), thread: v.number(), role: v.union(v.literal("user"), v.literal("assistant")), content: v.string() },
  handler: async (ctx, { secret: s, ...m }) => {
    guard(s);
    return (await ctx.db.insert("messages", m)) as string;
  },
});
