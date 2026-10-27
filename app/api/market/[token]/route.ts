import { tokenMarket } from "@/lib/chain/market";
import { api, query } from "@/lib/db";
import { errorText, fail, requireTeam } from "@/lib/server/http";
import { getExecutor, normalizeToken } from "@/lib/server/team";

/**
 * One token for the trade screen: its market numbers and pool, the team's fills in it, the open position with its
 * exits, and what the wallet holds. Candles come straight from GeckoTerminal in the browser.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const team = await requireTeam();
  if (team instanceof Response) return team;
  const token = normalizeToken((await params).token);
  if (!token) return fail(400, "Bad request.");
  try {
    const [market, trades, open, held] = await Promise.all([
      tokenMarket(token).catch(() => null),
      query(api.book.tradesFor, { owner: team.owner, token }),
      query(api.book.open, { owner: team.owner }),
      getExecutor().tokenBalance(team.wallet, token).catch(() => null),
    ]);
    const mine = open.filter((p) => p.token === token);
    const hand = mine.find((p) => !p.strategyId);
    return Response.json({
      market,
      trades: trades.map((t) => ({ side: t.side, eth: Number(t.wei) / 1e18, tokens: Number(t.tokens) / 1e18, hash: t.hash, at: t.at })),
      position: mine.length ? { tokens: mine.reduce((s, p) => s + Number(p.tokens) / 1e18, 0), costEth: mine.reduce((s, p) => s + Number(p.costWei) / 1e18, 0), takeProfitPct: hand?.takeProfitPct ?? null, stopLossPct: hand?.stopLossPct ?? null, hand: !!hand } : null,
      held: held === null ? null : Number(held) / 1e18,
    });
  } catch (err) {
    return fail(502, errorText(err));
  }
}
