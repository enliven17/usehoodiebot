import { parseEther } from "viem";

import { errorText, fail, requireTeam } from "@/lib/server/http";
import { withdraw } from "@/lib/server/team";
import { limited } from "@/lib/server/limit";

export const maxDuration = 120;

export async function POST(req: Request) {
  const team = await requireTeam();
  if (team instanceof Response) return team;
  const slow = await limited(team.owner, "withdraw");
  if (slow) return slow;
  const body = (await req.json().catch(() => null)) as { eth?: unknown } | null;
  let wei: bigint | "all";
  try {
    wei = body?.eth === "all" ? "all" : parseEther(String(body?.eth ?? ""));
  } catch {
    return fail(400, "Enter an amount in ETH.");
  }
  try {
    return Response.json({ hash: await withdraw(team, wei) });
  } catch (err) {
    return fail(409, errorText(err));
  }
}
