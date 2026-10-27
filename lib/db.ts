import "server-only";

import { ConvexHttpClient } from "convex/browser";
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";

export { api } from "@/convex/_generated/api";

/**
 * Convex from the Next server. Every function checks HOODIEBOT_SECRET (convex/guard.ts); these helpers add it, so
 * call sites pass only their own arguments.
 */
let client: ConvexHttpClient | null = null;
function convex() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  return (client ??= new ConvexHttpClient(url));
}
function secret() {
  const s = process.env.HOODIEBOT_SECRET;
  if (!s) throw new Error("HOODIEBOT_SECRET is not set");
  return s;
}

type Args<F extends FunctionReference<"query" | "mutation">> = Omit<FunctionArgs<F>, "secret">;

export const query = <F extends FunctionReference<"query">>(f: F, args: Args<F>): Promise<FunctionReturnType<F>> =>
  convex().query(f, { ...args, secret: secret() } as FunctionArgs<F>);

export const mutate = <F extends FunctionReference<"mutation">>(f: F, args: Args<F>): Promise<FunctionReturnType<F>> =>
  convex().mutation(f, { ...args, secret: secret() } as FunctionArgs<F>);
