import "server-only";

import { currentOwner } from "../session";
import { getTeam, type Team } from "./team";

export const fail = (status: number, error: string) => Response.json({ error }, { status });

/** The signed-in owner's team, or a Response to return. */
export async function requireTeam(): Promise<Team | Response> {
  const owner = await currentOwner();
  if (!owner) return fail(401, "Sign in first.");
  return (await getTeam(owner)) ?? fail(404, "No team yet.");
}

export const errorText = (err: unknown) => (err instanceof Error ? err.message.slice(0, 300) : "Something went wrong.");
