import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { guard, secret } from "./guard";

export const record = mutation({
  args: { secret, owner: v.string(), input: v.number(), output: v.number(), steps: v.number(), tools: v.number(), provider: v.string(), model: v.string(), finished: v.boolean() },
  handler: async (ctx, { secret: s, ...u }) => {
    guard(s);
    await ctx.db.insert("usage", u);
  },
});

/**
 * The comptroller's ledger for the last `days`: per owner and per model, jobs (owner messages), how many finished,
 * model steps, tool calls and tokens. Worst first by tokens per finished job.
 * ponytail: scans the window's rows; a daily rollup table once it runs into the hundreds of thousands.
 */
export const report = query({
  args: { secret, days: v.number() },
  handler: async (ctx, a) => {
    guard(a.secret);
    const since = Date.now() - a.days * 24 * 3600_000;
    const rows = await ctx.db.query("usage").order("desc").take(20_000);
    const recent = rows.filter((r) => r._creationTime >= since);
    const group = (key: (r: (typeof recent)[number]) => string) => {
      const m = new Map<string, { key: string; jobs: number; finished: number; steps: number; tools: number; input: number; output: number }>();
      for (const r of recent) {
        const k = key(r);
        const g = m.get(k) ?? { key: k, jobs: 0, finished: 0, steps: 0, tools: 0, input: 0, output: 0 };
        m.set(k, { key: k, jobs: g.jobs + 1, finished: g.finished + (r.finished ? 1 : 0), steps: g.steps + r.steps, tools: g.tools + r.tools, input: g.input + r.input, output: g.output + r.output });
      }
      return [...m.values()].sort((x, y) => (y.input + y.output) / Math.max(1, y.finished) - (x.input + x.output) / Math.max(1, x.finished));
    };
    return { owners: group((r) => r.owner), models: group((r) => `${r.provider}:${r.model}`) };
  },
});
