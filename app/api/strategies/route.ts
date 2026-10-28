import { api, mutate } from "@/lib/db";
import { logEvent } from "@/lib/server/events";
import { fail, requireTeam } from "@/lib/server/http";
import { parseSpec, WATCH_LABEL } from "@/lib/strategy";
import { limited } from "@/lib/server/limit";

/** A strategy the owner builds in the app; unlike the chat, the owner may set it to trade automatically from the start. */
export async function POST(req: Request) {
  const team = await requireTeam();
  if (team instanceof Response) return team;
  const slow = await limited(team.owner, "settings");
  if (slow) return slow;
  const b = (await req.json().catch(() => null)) as { name?: unknown; spec?: unknown; mode?: unknown } | null;
  const name = typeof b?.name === "string" ? b.name.trim().slice(0, 60) : "";
  if (!name) return fail(400, "Give the strategy a name.");
  const spec = parseSpec(b?.spec);
  const mode = b?.mode === "auto" ? "auto" : "ask";
  const id = await mutate(api.strategies.create, { owner: team.owner, name, spec, mode, limit: 5 });
  if (!id) return fail(409, "Five strategies are already running. Pause one first.");
  await logEvent(team.owner, { member: "sniper", kind: "strategy", text: `Saved the strategy "${name}", watching ${WATCH_LABEL[spec.watch]}, ${mode === "auto" ? "trading automatically under Autopilot" : "asking before each buy"}.` });
  return Response.json({ id });
}
