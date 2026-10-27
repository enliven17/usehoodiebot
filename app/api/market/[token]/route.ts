import { candles, tokenMarket, TIMEFRAMES, type Timeframe } from "@/lib/chain/market";
import { api, query } from "@/lib/db";
import { errorText, fail, requireTeam } from "@/lib/server/http";
import { normalizeToken } from "@/lib/server/team";

/** One token's chart: candles in ETH, the team's fills in it and its open position. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const team = await requireTeam();
  if (team instanceof Response) return team;
  const token = normalizeToken((await params).token);
  const tf = (new URL(req.url).searchParams.get("tf") ?? "5m") as Timeframe;
  if (!token || !(tf in TIMEFRAMES)) return fail(400, "Bad request.");
  try {
    const [market, trades, open] = await Promise.all([tokenMarket(token), query(api.book.tradesFor, { owner: team.owner, token }), query(api.book.open, { owner: team.owner })]);
    const held = open.filter((p) => p.token === token);
    return Response.json({
      market,
      candles: market ? await candles(market.pool, tf) : [],
      trades: trades.map((t) => ({ side: t.side, eth: Number(t.wei) / 1e18, tokens: Number(t.tokens) / 1e18, hash: t.hash, at: t.at })),
      position: held.length ? { tokens: held.reduce((s, p) => s + Number(p.tokens) / 1e18, 0), costEth: held.reduce((s, p) => s + Number(p.costWei) / 1e18, 0) } : null,
    });
  } catch (err) {
    return fail(502, errorText(err));
  }
}
