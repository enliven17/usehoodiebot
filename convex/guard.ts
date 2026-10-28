import { v } from "convex/values";

/** Every function is called by the Next server only, with HOODIEBOT_SECRET. Browsers never talk to Convex. */
export const secret = v.string();

/** Constant-time string compare (the Convex runtime has no node:crypto): the time does not depend on where they differ. */
function same(a: string, b: string) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export function guard(given: string) {
  const want = process.env.HOODIEBOT_SECRET;
  if (!want || want.length < 32) throw new Error("HOODIEBOT_SECRET is not set on this deployment");
  if (!same(given, want)) throw new Error("unauthorized");
}
