import { api, mutate } from "@/lib/db";
import { requireTeam } from "@/lib/server/http";

/** The owner drops a note from the team's memory. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const team = await requireTeam();
  if (team instanceof Response) return team;
  await mutate(api.memories.remove, { owner: team.owner, id: (await params).id });
  return Response.json({ ok: true });
}
