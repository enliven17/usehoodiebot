import { api, mutate } from "@/lib/db";
import { logEvent } from "@/lib/server/events";
import { fail, requireTeam } from "@/lib/server/http";

/** The owner switches the team between paper trading and live trading. */
export async function POST(req: Request) {
  const team = await requireTeam();
  if (team instanceof Response) return team;
  const mode = ((await req.json().catch(() => null)) as { mode?: unknown } | null)?.mode;
  if (mode !== "paper" && mode !== "live") return fail(400, "Bad request.");
  await mutate(api.book.setMode, { owner: team.owner, mode });
  await logEvent(team.owner, { member: "hoodiebot", kind: "mode", text: mode === "paper" ? "You switched to paper trading: trades fill at live prices with practice ETH." : "You switched to live trading: trades now use the team wallet's real ETH." });
  return Response.json({ ok: true });
}
