import { candidatePage, searchTokens } from "@/lib/chain/market";
import { api, query } from "@/lib/db";
import { requireTeam } from "@/lib/server/http";
import { limited } from "@/lib/server/limit";

/** The trade screen's token list: what the team holds, what it traded, then what is moving on Pons. */
export async function GET(req: Request) {
  const team = await requireTeam();
  if (team instanceof Response) return team;
  const slow = await limited(team.owner, "market");
  if (slow) return slow;
  const params = new URL(req.url).searchParams;
  const q = (params.get("q") ?? "").trim().slice(0, 40);
  const page = Math.max(1, Math.min(10, Math.floor(Number(params.get("page")) || 1)));
  if (q) {
    try {
      const tokens = await searchTokens(q);
      return Response.json({ tokens: tokens.map((c) => ({ ...c, group: "market" })), hasMore: false });
    } catch {
      return Response.json({ error: "Token search is temporarily unavailable. Try again shortly." }, { status: 503 });
    }
  }
  if (page > 1) {
    try {
      const result = await candidatePage(page);
      if (result.incomplete) return Response.json({ error: "Some token sources are busy. Retry this page shortly." }, { status: 503 });
      return Response.json({ tokens: result.tokens.filter((c) => !c.quote || c.quote === "WETH" || c.quote === "ETH").map((c) => ({ ...c, group: "market" })), hasMore: result.hasMore });
    } catch {
      return Response.json({ error: "Market data is temporarily unavailable. Try again shortly." }, { status: 503 });
    }
  }
  const [open, traded, result] = await Promise.all([
    query(api.book.open, { owner: team.owner, paper: team.mode === "paper" }),
    query(api.book.tradedTokens, { owner: team.owner, paper: team.mode === "paper" }),
    candidatePage().then((r) => ({ tokens: r.tokens.filter((c) => !c.quote || c.quote === "WETH" || c.quote === "ETH"), unavailable: r.incomplete, hasMore: r.hasMore })).catch(() => ({ tokens: [], unavailable: true, hasMore: true })),
  ]);
  const market = result.tokens;
  const held = new Set(open.map((p) => p.token));
  const info = new Map(market.map((c) => [c.token as string, c]));
  const mine = [...open.map((p) => ({ token: p.token, symbol: p.symbol })), ...traded].filter((t, i, all) => all.findIndex((x) => x.token === t.token) === i);
  return Response.json({
    tokens: [
      ...mine.map((t) => ({ ...info.get(t.token), token: t.token, symbol: t.symbol, group: held.has(t.token) ? "held" : "traded" })),
      ...market.filter((c) => !mine.some((t) => t.token === c.token)).map((c) => ({ ...c, group: "market" })),
    ],
    hasMore: result.hasMore,
    unavailable: result.unavailable,
  });
}
