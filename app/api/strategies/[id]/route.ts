import { sql } from "@/lib/db";
import { fail, requireTeam } from "@/lib/server/http";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const team = await requireTeam();
  if (team instanceof Response) return team;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { active?: unknown; mode?: unknown } | null;
  if (!/^[0-9a-f-]{36}$/.test(id) || !body) return fail(400, "Bad request.");
  const active = typeof body.active === "boolean" ? body.active : null;
  const mode = body.mode === "ask" || body.mode === "auto" ? body.mode : null;
  const [row] = await sql`update strategies set active = coalesce(${active}::boolean, active), mode = coalesce(${mode}::text, mode) where id = ${id}::uuid and owner = ${team.owner} returning id`;
  return row ? Response.json({ ok: true }) : fail(404, "No such strategy.");
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const team = await requireTeam();
  if (team instanceof Response) return team;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return fail(400, "Bad request.");
  await sql`delete from strategies where id = ${id}::uuid and owner = ${team.owner}`;
  return Response.json({ ok: true });
}
