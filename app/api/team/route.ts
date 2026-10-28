import { access } from "@/lib/server/access";
import { errorText, fail, requireTeam } from "@/lib/server/http";
import { snapshot } from "@/lib/server/snapshot";
import { ensureTeam } from "@/lib/server/team";
import { currentOwner } from "@/lib/session";
import { limited } from "@/lib/server/limit";

export async function GET() {
  const team = await requireTeam();
  if (team instanceof Response) return team;
  const slow = await limited(team.owner, "read");
  if (slow) return slow;
  return Response.json(await snapshot(team));
}

/** Creates the team wallet on the first visit after the application is approved. */
export async function POST() {
  const owner = await currentOwner();
  if (!owner) return fail(401, "Sign in first.");
  const slow = await limited(owner, "settings");
  if (slow) return slow;
  const status = await access(owner);
  if (status !== "approved") return Response.json({ error: "Your application is not approved yet.", access: status }, { status: 403 });
  try {
    return Response.json(await snapshot(await ensureTeam(owner)));
  } catch (err) {
    return fail(502, errorText(err));
  }
}
