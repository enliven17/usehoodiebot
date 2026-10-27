import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

/**
 * Every minute, ask the Vercel app to run its strategy tick (it holds the Privy and chain code).
 * Convex runs crons on every plan; Vercel Hobby only runs crons daily. Env: SITE_URL, CRON_SECRET.
 */
export const tick = internalAction({
  args: {},
  handler: async () => {
    const site = process.env.SITE_URL, key = process.env.CRON_SECRET;
    if (!site || !key) return;
    const res = await fetch(`${site.replace(/\/$/, "")}/api/cron/tick`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(55_000) });
    if (!res.ok) console.error(`tick ${res.status}`);
  },
});

const crons = cronJobs();
crons.interval("strategy tick", { minutes: 1 }, internal.crons.tick, {});
export default crons;
