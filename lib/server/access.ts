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

export type Access = "approved" | "pending" | "rejected" | "none";

/** Whether an owner is in. OPEN_ACCESS=1 lets everyone in (local development and e2e runs only). */
export async function access(owner: string): Promise<Access> {
  if (isAdmin(owner) || process.env.OPEN_ACCESS === "1") return "approved";
  const a = await query(api.applications.get, { owner });
  return a?.status ?? "none";
}
