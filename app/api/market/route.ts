import { candidates } from "@/lib/chain/market";
import { api, query } from "@/lib/db";
import { requireTeam } from "@/lib/server/http";
import { limited } from "@/lib/server/limit";

/** The trade screen's token list: what the team holds, what it traded, then what is moving on Pons. */
export async function GET() {
  const team = await requireTeam();
  if (team instanceof Response) return team;
  const slow = await limited(team.owner, "market");
  if (slow) return slow;
  const [open, traded, market] = await Promise.all([query(api.book.open, { owner: team.owner, paper: team.mode === "paper" }), query(api.book.tradedTokens, { owner: team.owner, paper: team.mode === "paper" }), candidates().then((all) => all.filter((c) => !c.quote || c.quote === "WETH" || c.quote === "ETH")).catch(() => [])]);
  const held = new Set(open.map((p) => p.token));
  const info = new Map(market.map((c) => [c.token as string, c]));
  const mine = [...open.map((p) => ({ token: p.token, symbol: p.symbol })), ...traded].filter((t, i, all) => all.findIndex((x) => x.token === t.token) === i);
  return Response.json({
    tokens: [
      ...mine.map((t) => ({ ...info.get(t.token), token: t.token, symbol: t.symbol, group: held.has(t.token) ? "held" : "traded" })),
      ...market.filter((c) => !mine.some((t) => t.token === c.token)).map((c) => ({ ...c, group: "market" })),
    ],
  });
}
