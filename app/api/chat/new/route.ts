import { newThread } from "@/lib/server/brain";
import { requireTeam } from "@/lib/server/http";

export async function POST() {
  const team = await requireTeam();
  if (team instanceof Response) return team;
  await newThread(team.owner);
  return Response.json({ lines: [] });
}
