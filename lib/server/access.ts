import "server-only";

import { getAddress, isAddress } from "viem";

import { api, query } from "../db";

/** Who runs the admin page (and is always let in). ADMIN_ADDRESSES overrides it, comma-separated. */
const ADMINS = (process.env.ADMIN_ADDRESSES ?? "0xcc78505FE8707a1D85229BA0E7177aE26cE0f17D")
  .split(",")
  .map((a) => a.trim())
  .filter((a) => isAddress(a))
  .map((a) => getAddress(a));

export const isAdmin = (owner: string | null | undefined) => !!owner && isAddress(owner) && ADMINS.includes(getAddress(owner));

export type Access = "approved" | "pending" | "rejected" | "none" | "needs_plan";

/** The owner's plan and when it ends, or null if they never paid. */
export const planOf = (owner: string) => query(api.subscriptions.get, { owner });

/**
 * Whether an owner is in: an approved application (admins always are), then a plan that has not run out.
 * OPEN_ACCESS=1 skips both (local development and e2e runs only).
 */
export async function access(owner: string): Promise<Access> {
  if (isAdmin(owner) || process.env.OPEN_ACCESS === "1") return "approved";
  const status = (await query(api.applications.get, { owner }))?.status ?? "none";
  if (status !== "approved") return status;
  return ((await planOf(owner))?.until ?? 0) > Date.now() ? "approved" : "needs_plan";
}
