import { api, mutate } from "@/lib/db";
import { fail, requireTeam } from "@/lib/server/http";
import { logEvent } from "@/lib/server/events";

/** The owner turns Autopilot on (with a budget) or off. Only the owner can: the chat has no tool for it. */
export async function POST(req: Request) {
  const team = await requireTeam();
  if (team instanceof Response) return team;
  const b = (await req.json().catch(() => null)) as { on?: unknown; budgetEth?: unknown } | null;
  const budgetEth = Number(b?.budgetEth);
  if (typeof b?.on !== "boolean" || !(budgetEth >= 0 && budgetEth <= 100)) return fail(400, "The budget goes from 0 to 100 ETH.");
  if (b.on && !(budgetEth > 0)) return fail(400, "Set a budget above 0 ETH first.");
  await mutate(api.teams.setAutopilot, { owner: team.owner, on: b.on, budgetEth });
  await logEvent(team.owner, { member: "hoodiebot", kind: "autopilot", text: b.on ? `You turned Autopilot on with a ${budgetEth} ETH budget. Automatic strategies now trade without asking, inside it.` : "You turned Autopilot off. Every strategy asks before it buys." });
  return Response.json({ ok: true });
}
