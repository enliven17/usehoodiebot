import { parseEther } from "viem";

import { errorText, fail, requireTeam } from "@/lib/server/http";
import { getExecutor, normalizeToken } from "@/lib/server/team";
import { auto } from "@/lib/server/tick";

export const maxDuration = 120;

/** The owner trading by hand from the trade screen: a buy in ETH, or a share of what the wallet holds. */
export async function POST(req: Request) {
  const team = await requireTeam();
  if (team instanceof Response) return team;
  const b = (await req.json().catch(() => null)) as { side?: unknown; token?: unknown; symbol?: unknown; eth?: unknown; pct?: unknown } | null;
  const token = normalizeToken(b?.token);
  const symbol = typeof b?.symbol === "string" ? b.symbol.replace(/[^\w$.\- ]/g, "").slice(0, 24) || "token" : "token";
  if (!token || (b?.side !== "buy" && b?.side !== "sell")) return fail(400, "Bad request.");
  let amount: bigint;
  try {
    if (b.side === "buy") {
      amount = parseEther(String(b.eth));
      if (amount <= 0n) throw new Error();
    } else {
      const pct = Number(b.pct);
      if (!(pct > 0 && pct <= 100)) throw new Error();
      const held = await getExecutor().tokenBalance(team.wallet, token);
      amount = pct === 100 ? 0n : (held * BigInt(Math.round(pct * 100))) / 10_000n;
      if (pct < 100 && amount === 0n) return fail(400, `The wallet holds no ${symbol}.`);
    }
  } catch {
    return fail(400, b.side === "buy" ? "Enter an ETH amount." : "Pick how much to sell.");
  }
  try {
    // auto() books the fill, logs it, and tracks a send that is not confirmed in time until the tick settles it
    const hash = await auto(team, { kind: b.side, token, symbol, amount, slippageBps: 300, strategyId: null }, "Traded by hand", "by your hand");
    return hash ? Response.json({ hash: hash.split(" ")[0], pending: hash.includes("sent") }) : fail(409, "Another trade is in flight. Try again in a minute.");
  } catch (err) {
    return fail(409, errorText(err));
  }
}
