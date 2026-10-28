import { parseEther } from "viem";

import { afterFee, FEE_BPS } from "@/lib/server/fees";
import { errorText, fail, requireTeam } from "@/lib/server/http";
import { getExecutor, heldOf, normalizeToken } from "@/lib/server/team";

/**
 * What a trade would fill at right now, fees included, read from the curve or the pool: tokens out for a buy of `eth`,
 * or ETH out for selling `pct` of what the wallet holds. `spot` is the price of one token, for the price impact.
 */
export async function GET(req: Request) {
  const team = await requireTeam();
  if (team instanceof Response) return team;
  const q = new URL(req.url).searchParams;
  const token = normalizeToken(q.get("token"));
  const side = q.get("side");
  if (!token || (side !== "buy" && side !== "sell")) return fail(400, "Bad request.");
  const ex = getExecutor();
  try {
    let amount: bigint;
    if (side === "buy") amount = parseEther(q.get("eth") ?? "0");
    else {
      const pct = Number(q.get("pct"));
      if (!(pct > 0 && pct <= 100)) return fail(400, "Bad request.");
      amount = ((await heldOf(team, token)) * BigInt(Math.round(pct * 100))) / 10_000n;
    }
    const feePct = Number(FEE_BPS) / 100;
    if (amount <= 0n) return Response.json({ in: 0, out: 0, spot: null, feePct });
    // the commission: off the ETH going in on a buy, off the ETH coming back on a sell
    const [out, spot] = await Promise.all([ex.quote(token, side, side === "buy" ? afterFee(amount) : amount), ex.prices([token]).then((m) => m.get(token) ?? null)]);
    return Response.json({ in: Number(amount) / 1e18, out: Number(side === "buy" ? out : afterFee(out)) / 1e18, spot, feePct });
  } catch (err) {
    return fail(502, errorText(err));
  }
}
