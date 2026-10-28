import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { guard, secret } from "./guard";

/** Sessions an owner signed in to before this moment no longer count (sign out everywhere). */
export const revokedBefore = query({
  args: { secret, owner: v.string() },
  handler: async (ctx, a) => {
    guard(a.secret);
    return (await ctx.db.query("revocations").withIndex("by_owner", (q) => q.eq("owner", a.owner)).unique())?.before ?? 0;
  },
});

export const revoke = mutation({
  args: { secret, owner: v.string() },
  handler: async (ctx, a) => {
    guard(a.secret);
    const row = await ctx.db.query("revocations").withIndex("by_owner", (q) => q.eq("owner", a.owner)).unique();
    if (row) await ctx.db.patch(row._id, { before: Date.now() });
    else await ctx.db.insert("revocations", { owner: a.owner, before: Date.now() });
  },
});
