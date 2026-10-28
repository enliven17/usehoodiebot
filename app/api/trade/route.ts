import { parseEther } from "viem";

import { api, mutate } from "@/lib/db";
import { errorText, fail, requireTeam } from "@/lib/server/http";
import { heldOf, normalizeToken } from "@/lib/server/team";
import { auto } from "@/lib/server/tick";
import { exitsOf, SPEC_LIMITS } from "@/lib/strategy";


export const maxDuration = 120;

/** The owner trading by hand from the trade screen: a buy in ETH, or a share of what the wallet holds. */
export async function POST(req: Request) {
  const team = await requireTeam();
  if (team instanceof Response) return team;
  const b = (await req.json().catch(() => null)) as { side?: unknown; token?: unknown; symbol?: unknown; eth?: unknown; pct?: unknown; slippageBps?: unknown; takeProfitPct?: unknown; stopLossPct?: unknown; trailingStopPct?: unknown; cardId?: unknown } | null;
  const token = normalizeToken(b?.token);
  const symbol = typeof b?.symbol === "string" ? b.symbol.replace(/[^\w$.\- ]/g, "").slice(0, 24) || "token" : "token";
  if (!token || (b?.side !== "buy" && b?.side !== "sell")) return fail(400, "Bad request.");
  const slippageBps = Math.round(Number(b.slippageBps ?? 300));
  if (!(slippageBps >= SPEC_LIMITS.slippageBps[0] && slippageBps <= SPEC_LIMITS.slippageBps[1])) return fail(400, "Slippage goes from 0.5% to 15%.");
  const exits = exitsOf(b);
  if (typeof exits === "string") return fail(400, exits);
  let amount: bigint;
  try {
    if (b.side === "buy") {
      amount = parseEther(String(b.eth));
      if (amount <= 0n) throw new Error();
    } else {
      const pct = Number(b.pct);
      if (!(pct > 0 && pct <= 100)) throw new Error();
      const held = await heldOf(team, token);
      amount = pct === 100 ? 0n : (held * BigInt(Math.round(pct * 100))) / 10_000n;
      if (pct < 100 && amount === 0n) return fail(400, `The wallet holds no ${symbol}.`);
    }
  } catch {
    return fail(400, b.side === "buy" ? "Enter an ETH amount." : "Pick how much to sell.");
  }
  const cardId = typeof b.cardId === "string" && /^[\w-]{1,80}$/.test(b.cardId) ? b.cardId : null;
  if (cardId && !(await mutate(api.chatTrades.claim, { owner: team.owner, cardId }))) return fail(409, "This one is already done.");
  try {
    // auto() books the fill, logs it, and tracks a send that is not confirmed in time until the tick settles it
    // ponytail: a buy that is sent but not confirmed in time is settled later without its exits; set them again on the position.
    const hash = await auto(team, { kind: b.side, token, symbol, amount, slippageBps, strategyId: null, ...(b.side === "buy" ? exits : {}) }, "Traded by hand", "by your hand");
    if (cardId) await mutate(api.chatTrades.settle, { owner: team.owner, cardId, hash: hash?.split(" ")[0] });
    return hash ? Response.json({ hash: hash.split(" ")[0], pending: hash.includes("sent") }) : fail(409, "Another trade is in flight. Try again in a minute.");
  } catch (err) {
    if (cardId) await mutate(api.chatTrades.settle, { owner: team.owner, cardId });
    return fail(409, errorText(err));
  }
}
