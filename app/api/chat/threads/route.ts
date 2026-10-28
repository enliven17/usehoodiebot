import { threads } from "@/lib/server/brain";
import { requireTeam } from "@/lib/server/http";
import { limited } from "@/lib/server/limit";

export async function GET() {
  const team = await requireTeam();
  if (team instanceof Response) return team;
  const slow = await limited(team.owner, "read");
  if (slow) return slow;
  return Response.json({ threads: await threads(team.owner) });
}
