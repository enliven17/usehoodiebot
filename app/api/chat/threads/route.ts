import { threads } from "@/lib/server/brain";
import { requireTeam } from "@/lib/server/http";

export async function GET() {
  const team = await requireTeam();
  if (team instanceof Response) return team;
  return Response.json({ threads: await threads(team.owner) });
}
