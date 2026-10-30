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
 * Whether an owner is in: a plan that has not run out (admins always are). A plan is bought in ETH after an approved
 * application, or in $WIF without one, so a running plan is enough. OPEN_ACCESS=1 skips it (local development and e2e).
 */
export async function access(owner: string): Promise<Access> {
  if (isAdmin(owner) || process.env.OPEN_ACCESS === "1") return "approved";
  const [plan, app] = await Promise.all([planOf(owner), query(api.applications.get, { owner })]);
  if ((plan?.until ?? 0) > Date.now()) return "approved";
  const status = app?.status ?? "none";
  return status === "approved" ? "needs_plan" : status;
}
