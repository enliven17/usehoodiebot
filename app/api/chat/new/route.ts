import { newThread } from "@/lib/server/brain";
import { requireTeam } from "@/lib/server/http";
import { limited } from "@/lib/server/limit";

export async function POST() {
  const team = await requireTeam();
  if (team instanceof Response) return team;
  const slow = await limited(team.owner, "settings");
  if (slow) return slow;
  await newThread(team.owner);
  return Response.json({ lines: [] });
}
