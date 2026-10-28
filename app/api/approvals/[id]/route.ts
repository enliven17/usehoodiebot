import { errorText, fail, requireTeam } from "@/lib/server/http";
import { decide } from "@/lib/server/team";
import { limited } from "@/lib/server/limit";

export const maxDuration = 120;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const team = await requireTeam();
  if (team instanceof Response) return team;
  const slow = await limited(team.owner, "trade");
  if (slow) return slow;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { approve?: unknown } | null;
  if (!/^[a-z0-9]{8,64}$/.test(id) || typeof body?.approve !== "boolean") return fail(400, "Bad request.");
  try {
    return Response.json(await decide(team.owner, id, body.approve));
  } catch (err) {
    return fail(409, errorText(err));
  }
}
