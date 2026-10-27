import { v } from "convex/values";

/** Every function is called by the Next server only, with HOODIEBOT_SECRET. Browsers never talk to Convex. */
export const secret = v.string();

export function guard(given: string) {
  const want = process.env.HOODIEBOT_SECRET;
  if (!want || want.length < 32) throw new Error("HOODIEBOT_SECRET is not set on this deployment");
  // ponytail: plain compare; network jitter swamps any timing signal at this layer
  if (given !== want) throw new Error("unauthorized");
}
