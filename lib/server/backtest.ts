import "server-only";

import { candidates, candles, type Candidate } from "../chain/market";
import { replay, summarize, type Backtest, type Replay } from "../ta";
import type { Spec } from "../strategy";

/** Round trip in fees: about 1% on the curve or pool each way plus Hoodie's 0.5% each way. */
const COST_PCT = 3;
const MAX_TOKENS = 10;
/** GeckoTerminal allows about 30 calls a minute from one address: the replays go one at a time, this far apart. */
const PACE_MS = 2000;

export type BacktestRun = { summary: Backtest | null; tokens: Array<{ symbol: string; token: string } & Replay>; note: string };

/**
 * Replays a strategy's exits on recent Pons tokens of the kind it watches: buy at the first candle in the window, then
 * take profit, stop loss and trailing stop candle by candle, fees off. New and curve tokens on minute candles (about 5
 * hours), graduated ones on 5-minute candles (about a day).
 * ponytail: today's token list, so tokens that died and dropped off GeckoTerminal are missing (survivorship), and the
 * entry filters are not replayed in time; it tests the exits, not the picking. Up to 10 tokens between 1 and 24 hours old
 * (enough candles since launch), one paced candle call each.
 */
export async function backtest(spec: Spec): Promise<BacktestRun> {
  const venue = (c: Candidate) => (spec.watch === "graduated" ? c.venue === "graduated" : spec.watch === "all" ? true : c.venue === "curve");
  const aged = (c: Candidate) => spec.watch === "graduated" || spec.watch === "all" || ((c.ageMinutes ?? 0) >= 60 && (c.ageMinutes ?? Infinity) <= 24 * 60);
  const pool = (await candidates()).filter((c) => venue(c) && c.pool && aged(c)).slice(0, MAX_TOKENS);
  const tf = spec.watch === "graduated" || spec.watch === "all" ? "5m" : "1m";
  const tokens: BacktestRun["tokens"] = [];
  for (const [k, c] of pool.entries()) {
    if (k) await new Promise((ok) => setTimeout(ok, PACE_MS));
    const bars = await candles(c.pool!, tf).catch(() => []);
    const r = bars.length >= 10 ? replay(bars, spec, COST_PCT) : null;
    if (r) tokens.push({ symbol: c.symbol, token: c.token, ...r });
  }
  return {
    summary: summarize(tokens, spec.sizeEth),
    tokens,
    note: `Replayed on ${tokens.length} recent ${spec.watch === "graduated" ? "graduated" : "Pons"} tokens, ${tf} candles, ${COST_PCT}% round-trip fees. It tests the exits on tokens still listed today, not the entry filters, so real results will be lower.`,
  };
}
