import { errorText, fail, requireTeam } from "@/lib/server/http";
import { snapshot } from "@/lib/server/snapshot";
import { ensureTeam } from "@/lib/server/team";
import { currentOwner } from "@/lib/session";

export async function GET() {
  const team = await requireTeam();
  return team instanceof Response ? team : Response.json(await snapshot(team));
}

/** Creates the team wallet on first visit. */
export async function POST() {
  const owner = await currentOwner();
  if (!owner) return fail(401, "Sign in first.");
  try {
    return Response.json(await snapshot(await ensureTeam(owner)));
  } catch (err) {
    return fail(502, errorText(err));
  }
}
