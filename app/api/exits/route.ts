import { api, mutate } from "@/lib/db";
import { fail, requireTeam } from "@/lib/server/http";
import { normalizeToken } from "@/lib/server/team";
import { exitsOf } from "@/lib/strategy";

/** Sets or clears the take profit and stop loss on the owner's hand-bought position in a token. */
export async function POST(req: Request) {
  const team = await requireTeam();
  if (team instanceof Response) return team;
  const b = (await req.json().catch(() => null)) as { token?: unknown; takeProfitPct?: unknown; stopLossPct?: unknown; trailingStopPct?: unknown } | null;
  const token = normalizeToken(b?.token);
  if (!token) return fail(400, "Bad request.");
  const exits = exitsOf(b!);
  if (typeof exits === "string") return fail(400, exits);
  const n = await mutate(api.book.setExits, { owner: team.owner, token, ...exits });
  return n ? Response.json({ ok: true }) : fail(404, "No position you bought by hand in this token.");
}
