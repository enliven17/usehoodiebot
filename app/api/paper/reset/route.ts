import { api, mutate } from "@/lib/db";
import { requireTeam } from "@/lib/server/http";

/** Starts the paper book over at 1 ETH. */
export async function POST() {
  const team = await requireTeam();
  if (team instanceof Response) return team;
  await mutate(api.book.resetPaper, { owner: team.owner });
  return Response.json({ ok: true });
}
