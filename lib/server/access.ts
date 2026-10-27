import "server-only";

import { erc20Abi, formatUnits, getAddress, isAddress, type Address } from "viem";

import { publicClient } from "../chain/robinhood";
import { api, query } from "../db";

/** Who runs the admin page (and is always let in). ADMIN_ADDRESSES overrides it, comma-separated. */
const ADMINS = (process.env.ADMIN_ADDRESSES ?? "0xcc78505FE8707a1D85229BA0E7177aE26cE0f17D")
  .split(",")
  .map((a) => a.trim())
  .filter((a) => isAddress(a))
  .map((a) => getAddress(a));

export const isAdmin = (owner: string | null | undefined) => !!owner && isAddress(owner) && ADMINS.includes(getAddress(owner));

/**
 * The $HOODIE gate, off until the token exists: set HOODIE_TOKEN (its address on Robinhood Chain) and HOODIE_MIN (whole
 * tokens, default 50,000) and an approved owner also has to hold that much in the wallet they sign in with.
 */
const token = process.env.HOODIE_TOKEN && isAddress(process.env.HOODIE_TOKEN) ? getAddress(process.env.HOODIE_TOKEN) : null;
export const TOKEN_GATE = token ? { token, min: Math.max(0, Number(process.env.HOODIE_MIN ?? 50_000) || 0) } : null;

// ponytail: per-instance cache of a minute, so polling and every API call do not each read the chain
const balances = new Map<string, { at: number; whole: number }>();
/** Whole $HOODIE the owner holds, or null while the token is not live. */
export async function hoodieBalance(owner: string): Promise<number | null> {
  if (!TOKEN_GATE) return null;
  const hit = balances.get(owner);
  if (hit && Date.now() - hit.at < 60_000) return hit.whole;
  const client = publicClient();
  const [raw, decimals] = await Promise.all([
    client.readContract({ address: TOKEN_GATE.token, abi: erc20Abi, functionName: "balanceOf", args: [owner as Address] }),
    client.readContract({ address: TOKEN_GATE.token, abi: erc20Abi, functionName: "decimals" }),
  ]);
  const whole = Number(formatUnits(raw, decimals));
  balances.set(owner, { at: Date.now(), whole });
  return whole;
}

export type Access = "approved" | "pending" | "rejected" | "none" | "needs_token";

/**
 * Whether an owner is in: an approved application (admins always are), then, once $HOODIE is live, enough of it.
 * OPEN_ACCESS=1 skips the application (local development and e2e runs only), never the token.
 */
export async function access(owner: string): Promise<Access> {
  if (isAdmin(owner)) return "approved";
  const status = process.env.OPEN_ACCESS === "1" ? "approved" : ((await query(api.applications.get, { owner }))?.status ?? "none");
  if (status !== "approved" || !TOKEN_GATE) return status;
  const held = await hoodieBalance(owner).catch(() => null);
  // a chain read that fails lets them in rather than locking everyone out on an RPC hiccup
  return held === null || held >= TOKEN_GATE.min ? "approved" : "needs_token";
}
