import { api, query } from "@/lib/db";
import { toLines } from "@/lib/lines";
import { chat, thread } from "@/lib/server/brain";
import { errorText, fail, requireTeam } from "@/lib/server/http";
import { TOOL_MEMBER } from "@/lib/server/tools";
import { limited } from "@/lib/server/limit";

export const maxDuration = 300;

export async function GET() {
  const team = await requireTeam();
  if (team instanceof Response) return team;
  const slow = await limited(team.owner, "read");
  if (slow) return slow;
  return Response.json({ lines: toLines(await thread(team), TOOL_MEMBER, await query(api.chatTrades.done, { owner: team.owner })) });
}

export async function POST(req: Request) {
  const team = await requireTeam();
  if (team instanceof Response) return team;
  const slow = await limited(team.owner, "chat", "chatDay");
  if (slow) return slow;
  const body = (await req.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return fail(400, "Say something first.");
  try {
    await chat(team, text);
    return Response.json({ lines: toLines(await thread(team), TOOL_MEMBER, await query(api.chatTrades.done, { owner: team.owner })) });
  } catch (err) {
    return fail(502, errorText(err));
  }
}
