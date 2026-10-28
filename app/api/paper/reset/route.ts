import { api, mutate } from "@/lib/db";
import { requireTeam } from "@/lib/server/http";
import { limited } from "@/lib/server/limit";

/** Starts the paper book over at 1 ETH. */
export async function POST() {
  const team = await requireTeam();
  if (team instanceof Response) return team;
  const slow = await limited(team.owner, "settings");
  if (slow) return slow;
  await mutate(api.book.resetPaper, { owner: team.owner });
  return Response.json({ ok: true });
}
