import "server-only";

import { currentOwner } from "../session";
import { access, hoodieBalance, isAdmin, TOKEN_GATE } from "./access";

// ponytail: per-instance cache of a minute, so a revoked approval takes effect within a minute without a query per call
const admitted = new Map<string, { at: number; ok: boolean }>();
async function stillApproved(owner: string) {
  const hit = admitted.get(owner);
  if (hit && Date.now() - hit.at < 60_000) return hit.ok;
  const ok = (await access(owner).catch(() => "approved")) === "approved";
  admitted.set(owner, { at: Date.now(), ok });
  return ok;
}
import { getTeam, type Team } from "./team";

export const fail = (status: number, error: string) => Response.json({ error }, { status });

/** The signed-in owner's team, or a Response to return. Once $HOODIE is live, only while they hold enough of it. */
export async function requireTeam(): Promise<Team | Response> {
  const owner = await currentOwner();
  if (!owner) return fail(401, "Sign in first.");
  if (!(await stillApproved(owner))) return fail(403, "Your access is not approved.");
  if (TOKEN_GATE && !isAdmin(owner)) {
    const held = await hoodieBalance(owner).catch(() => null);
    if (held !== null && held < TOKEN_GATE.min) return fail(403, `Hold ${TOKEN_GATE.min.toLocaleString("en-US")} $HOODIE in this wallet to use Hoodie.`);
  }
  return (await getTeam(owner)) ?? fail(404, "No team yet.");
}

export { safeMessage as errorText } from "./errors";
