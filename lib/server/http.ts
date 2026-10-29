import "server-only";

import { currentOwner } from "../session";
import { access } from "./access";

// ponytail: per-instance cache of a minute for a yes only, so a lapsed plan or revoked approval bites within a minute
// and a fresh payment opens at once
const admitted = new Map<string, number>();
async function stillApproved(owner: string) {
  if (Date.now() - (admitted.get(owner) ?? 0) < 60_000) return true;
  const ok = (await access(owner).catch(() => "approved")) === "approved";
  if (ok) admitted.set(owner, Date.now());
  return ok;
}
import { getTeam, type Team } from "./team";

export const fail = (status: number, error: string) => Response.json({ error }, { status });

/** The signed-in owner's team, or a Response to return: only while they are approved and their plan runs. */
export async function requireTeam(): Promise<Team | Response> {
  const owner = await currentOwner();
  if (!owner) return fail(401, "Sign in first.");
  if (!(await stillApproved(owner))) return fail(403, "Your access is not approved, or your plan has run out.");
  return (await getTeam(owner)) ?? fail(404, "No team yet.");
}

export { safeMessage as errorText } from "./errors";
