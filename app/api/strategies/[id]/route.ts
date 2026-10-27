import { api, mutate } from "@/lib/db";
import { fail, requireTeam } from "@/lib/server/http";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const team = await requireTeam();
  if (team instanceof Response) return team;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { active?: unknown; mode?: unknown } | null;
  if (!body) return fail(400, "Bad request.");
  const ok = await mutate(api.strategies.update, {
    owner: team.owner,
    id,
    ...(typeof body.active === "boolean" ? { active: body.active } : {}),
    ...(body.mode === "ask" || body.mode === "auto" ? { mode: body.mode } : {}),
  });
  return ok ? Response.json({ ok: true }) : fail(404, "No such strategy.");
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const team = await requireTeam();
  if (team instanceof Response) return team;
  await mutate(api.strategies.remove, { owner: team.owner, id: (await params).id });
  return Response.json({ ok: true });
}
