import "server-only";

import { headers } from "next/headers";

import { api, mutate } from "../db";

const MIN = 60_000;

/** Every limit in one place: how many hits per window, per signed-in owner (or per IP before sign-in). */
export const LIMITS = {
  nonce: [20, MIN],
  verify: [10, MIN],
  chat: [12, MIN],
  chatDay: [300, 24 * 60 * MIN],
  trade: [20, MIN],
  withdraw: [5, MIN],
  pay: [10, MIN],
  quote: [90, MIN],
  market: [60, MIN],
  read: [120, MIN],
  backtest: [3, 5 * MIN],
  apply: [5, 60 * MIN],
  applyIp: [20, 60 * MIN],
  settings: [30, MIN],
} as const satisfies Record<string, readonly [number, number]>;

/** The caller's address as Vercel saw it, for limits before sign-in. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/**
 * Counts one hit on `name` for `who`; a 429 Response to return when it is over, else null. Several names can be checked
 * in one call (a per-minute and a per-day limit). A limiter that cannot answer lets the request through: availability
 * over strictness, since every route behind it is also signed in and capped elsewhere.
 */
export async function limited(who: string, ...names: Array<keyof typeof LIMITS>): Promise<Response | null> {
  for (const name of names) {
    const [limit, windowMs] = LIMITS[name];
    const r = await mutate(api.limits.hit, { key: `${name}:${who.toLowerCase()}`, limit, windowMs }).catch(() => ({ ok: true, retryMs: 0 }));
    if (!r.ok) {
      const seconds = Math.max(1, Math.ceil(r.retryMs / 1000));
      return Response.json({ error: `Slow down: try again in ${seconds < 120 ? `${seconds} seconds` : `${Math.ceil(seconds / 60)} minutes`}.` }, { status: 429, headers: { "retry-after": String(seconds) } });
    }
  }
  return null;
}
