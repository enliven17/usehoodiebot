import { requireTeam, errorText, fail } from "@/lib/server/http";
import { backtest } from "@/lib/server/backtest";
import { presetById } from "@/lib/presets";
import { parseSpec } from "@/lib/strategy";

export const maxDuration = 120;

/** Replays a strategy's exits on recent tokens, for the builder's Backtest button. */
export async function POST(req: Request) {
  const team = await requireTeam();
  if (team instanceof Response) return team;
  const b = (await req.json().catch(() => null)) as { preset?: unknown; spec?: unknown } | null;
  try {
    return Response.json(await backtest(parseSpec({ ...(presetById(b?.preset)?.spec ?? {}), ...((b?.spec as object) ?? {}) })));
  } catch (err) {
    return fail(502, errorText(err));
  }
}
