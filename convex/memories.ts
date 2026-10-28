import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { guard, secret } from "./guard";

/** What the owner asked the team to keep in mind across chats, oldest first. */
export const list = query({
  args: { secret, owner: v.string() },
  handler: async (ctx, a) => {
    guard(a.secret);
    return (await ctx.db.query("memories").withIndex("by_owner", (q) => q.eq("owner", a.owner)).take(40)).map((m) => ({ id: m._id as string, text: m.text, at: m._creationTime }));
  },
});

/** At most 40 notes; false when full. */
export const add = mutation({
  args: { secret, owner: v.string(), text: v.string() },
  handler: async (ctx, a) => {
    guard(a.secret);
    const n = (await ctx.db.query("memories").withIndex("by_owner", (q) => q.eq("owner", a.owner)).take(40)).length;
    if (n >= 40) return null;
    return (await ctx.db.insert("memories", { owner: a.owner, text: a.text.slice(0, 280) })) as string;
  },
});

export const remove = mutation({
  args: { secret, owner: v.string(), id: v.string() },
  handler: async (ctx, a) => {
    guard(a.secret);
    const id = ctx.db.normalizeId("memories", a.id);
    const m = id && (await ctx.db.get(id));
    if (m && m.owner === a.owner) await ctx.db.delete(m._id);
    return !!m;
  },
});
