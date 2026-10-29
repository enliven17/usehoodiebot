import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { guard, secret } from "./guard";

export const get = query({
  args: { secret, owner: v.string() },
  handler: async (ctx, a) => {
    guard(a.secret);
    const row = await ctx.db.query("subscriptions").withIndex("by_owner", (q) => q.eq("owner", a.owner)).unique();
    return row ? { plan: row.plan, until: row.until } : null;
  },
});

/**
 * Books a verified payment: the plan runs `days` longer from its end, or from now once lapsed. A hash already booked
 * changes nothing, so a retried request or a replayed transfer never extends twice.
 */
export const pay = mutation({
  args: { secret, owner: v.string(), hash: v.string(), plan: v.string(), wei: v.string(), days: v.number() },
  handler: async (ctx, { secret: s, days, ...p }) => {
    guard(s);
    const row = await ctx.db.query("subscriptions").withIndex("by_owner", (q) => q.eq("owner", p.owner)).unique();
    const seen = await ctx.db.query("payments").withIndex("by_hash", (q) => q.eq("hash", p.hash)).unique();
    if (seen) return seen.owner === p.owner && row ? { plan: row.plan, until: row.until } : null;
    await ctx.db.insert("payments", p);
    const until = Math.max(Date.now(), row?.until ?? 0) + days * 24 * 3600_000;
    if (row) await ctx.db.patch(row._id, { plan: p.plan, until });
    else await ctx.db.insert("subscriptions", { owner: p.owner, plan: p.plan, until });
    return { plan: p.plan, until };
  },
});
