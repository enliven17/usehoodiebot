import { v } from "convex/values";

import { mutation } from "./_generated/server";
import { guard, secret } from "./guard";

/** Adds `amount` to a rolling total for `key` if it stays within `cap`; false (and nothing added) when it would not. */
export const spend = mutation({
  args: { secret, key: v.string(), amount: v.number(), cap: v.number(), windowMs: v.number() },
  handler: async (ctx, a) => {
    guard(a.secret);
    const now = Date.now();
    const row = await ctx.db.query("limits").withIndex("by_key", (q) => q.eq("key", a.key)).unique();
    const used = row && now - row.windowStart < a.windowMs ? row.count : 0;
    if (used + a.amount > a.cap) return { ok: false, used };
    if (!row) await ctx.db.insert("limits", { key: a.key, windowStart: now, count: a.amount });
    else await ctx.db.patch(row._id, used === 0 ? { windowStart: now, count: a.amount } : { count: used + a.amount });
    return { ok: true, used: used + a.amount };
  },
});

/**
 * Rate limits shared by every server instance: a fixed window per key ("chat:0xabc…", "nonce:1.2.3.4"). Counts the
 * hit and answers whether it fits, with the milliseconds until the window opens again when it does not.
 * ponytail: fixed windows allow a burst of up to twice the limit across a boundary; a sliding log if that ever matters.
 */
export const hit = mutation({
  args: { secret, key: v.string(), limit: v.number(), windowMs: v.number() },
  handler: async (ctx, a) => {
    guard(a.secret);
    const now = Date.now();
    const row = await ctx.db.query("limits").withIndex("by_key", (q) => q.eq("key", a.key)).unique();
    if (!row || now - row.windowStart >= a.windowMs) {
      if (row) await ctx.db.patch(row._id, { windowStart: now, count: 1 });
      else await ctx.db.insert("limits", { key: a.key, windowStart: now, count: 1 });
      return { ok: true, retryMs: 0 };
    }
    if (row.count >= a.limit) return { ok: false, retryMs: row.windowStart + a.windowMs - now };
    await ctx.db.patch(row._id, { count: row.count + 1 });
    return { ok: true, retryMs: 0 };
  },
});
