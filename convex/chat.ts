import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { guard, secret } from "./guard";

/** One thread, oldest first: the open one unless `thread` names another. */
export const thread = query({
  args: { secret, owner: v.string(), thread: v.optional(v.number()) },
  handler: async (ctx, a) => {
    guard(a.secret);
    const team = await ctx.db.query("teams").withIndex("by_owner", (q) => q.eq("owner", a.owner)).unique();
    if (!team) return { thread: 0, rows: [] };
    const n = a.thread ?? team.thread;
    const rows = await ctx.db.query("messages").withIndex("by_thread", (q) => q.eq("owner", a.owner).eq("thread", n)).collect();
    return { thread: n, rows: rows.map((r) => ({ id: r._id as string, role: r.role, content: JSON.parse(r.content) as unknown })) };
  },
});

/** Past chats, newest first: each titled by its first owner message. Empty threads are left out. */
export const threads = query({
  args: { secret, owner: v.string() },
  handler: async (ctx, a) => {
    guard(a.secret);
    const team = await ctx.db.query("teams").withIndex("by_owner", (q) => q.eq("owner", a.owner)).unique();
    if (!team) return [];
    const last = Math.max(team.thread, team.lastThread ?? 0);
    const out: Array<{ thread: number; title: string; at: number; open: boolean }> = [];
    // ponytail: one indexed read per thread, newest 50; a threads table if owners ever keep hundreds of chats.
    for (let n = last; n >= 0 && out.length < 50; n--) {
      const q = () => ctx.db.query("messages").withIndex("by_thread", (i) => i.eq("owner", a.owner).eq("thread", n));
      const first = await q().first();
      if (!first) continue;
      const lastMsg = await q().order("desc").first();
      const m = JSON.parse(first.content) as { content?: unknown };
      out.push({ thread: n, title: typeof m.content === "string" ? m.content.slice(0, 120) : "Chat", at: lastMsg!._creationTime, open: n === team.thread });
    }
    return out;
  },
});

export const append = mutation({
  args: { secret, owner: v.string(), thread: v.number(), role: v.union(v.literal("user"), v.literal("assistant"), v.literal("tool")), content: v.string() },
  handler: async (ctx, { secret: s, ...m }) => {
    guard(s);
    return (await ctx.db.insert("messages", m)) as string;
  },
});
