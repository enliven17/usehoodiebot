import { api, query } from "@/lib/db";
import { toLines } from "@/lib/lines";
import { openThread, thread } from "@/lib/server/brain";
import { fail, requireTeam } from "@/lib/server/http";
import { TOOL_MEMBER } from "@/lib/server/tools";
import { limited } from "@/lib/server/limit";

/** Reopens a past chat and returns its lines. */
export async function POST(req: Request) {
  const team = await requireTeam();
  if (team instanceof Response) return team;
  const slow = await limited(team.owner, "settings");
  if (slow) return slow;
  const body = (await req.json().catch(() => null)) as { thread?: unknown } | null;
  const n = body?.thread;
  if (typeof n !== "number" || !(await openThread(team.owner, n))) return fail(400, "No such chat.");
  return Response.json({ lines: toLines(await thread(team, n), TOOL_MEMBER, await query(api.chatTrades.done, { owner: team.owner })) });
}
