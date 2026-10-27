import "server-only";

import { currentOwner } from "../session";
import { hoodieBalance, isAdmin, TOKEN_GATE } from "./access";
import { getTeam, type Team } from "./team";

export const fail = (status: number, error: string) => Response.json({ error }, { status });

/** The signed-in owner's team, or a Response to return. Once $HOODIE is live, only while they hold enough of it. */
export async function requireTeam(): Promise<Team | Response> {
  const owner = await currentOwner();
  if (!owner) return fail(401, "Sign in first.");
  if (TOKEN_GATE && !isAdmin(owner)) {
    const held = await hoodieBalance(owner).catch(() => null);
    if (held !== null && held < TOKEN_GATE.min) return fail(403, `Hold ${TOKEN_GATE.min.toLocaleString("en-US")} $HOODIE in this wallet to use Hoodie.`);
  }
  return (await getTeam(owner)) ?? fail(404, "No team yet.");
}

export { safeMessage as errorText } from "./errors";
