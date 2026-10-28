/**
 * The owner's trade journal: how their closed positions went and the habits behind the numbers. Pure. After
 * Vibe-Trading's trade-journal and Shadow Account diagnostics (github.com/HKUDS/Vibe-Trading, MIT).
 */
export type Closed = { symbol: string; costEth: number; proceedsEth: number; openedAt: number; closedAt: number; byStrategy: boolean };

export type Journal = {
  closed: number;
  winRatePct: number;
  pnlEth: number;
  avgWinPct: number | null;
  avgLossPct: number | null;
  profitFactor: number | null;
  avgHoldWinMin: number | null;
  avgHoldLossMin: number | null;
  best: { symbol: string; pct: number } | null;
  worst: { symbol: string; pct: number } | null;
  /** hand trades against strategy trades */
  hand: { closed: number; pnlEth: number };
  strategies: { closed: number; pnlEth: number };
  habits: string[];
};

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function journal(rows: Closed[]): Journal | null {
  if (!rows.length) return null;
  const t = rows.map((r) => ({ ...r, pct: r.costEth > 0 ? (r.proceedsEth / r.costEth - 1) * 100 : 0, pnl: r.proceedsEth - r.costEth, holdMin: Math.max(0, (r.closedAt - r.openedAt) / 60_000) }));
  const wins = t.filter((x) => x.pnl > 0);
  const losses = t.filter((x) => x.pnl <= 0);
  const sorted = [...t].sort((a, b) => a.pct - b.pct);
  const lossSum = -losses.reduce((a, x) => a + x.pnl, 0);
  const side = (byStrategy: boolean) => {
    const xs = t.filter((x) => x.byStrategy === byStrategy);
    return { closed: xs.length, pnlEth: xs.reduce((a, x) => a + x.pnl, 0) };
  };
  const j: Journal = {
    closed: t.length,
    winRatePct: (wins.length / t.length) * 100,
    pnlEth: t.reduce((a, x) => a + x.pnl, 0),
    avgWinPct: avg(wins.map((x) => x.pct)),
    avgLossPct: avg(losses.map((x) => x.pct)),
    profitFactor: lossSum > 0 ? wins.reduce((a, x) => a + x.pnl, 0) / lossSum : null,
    avgHoldWinMin: avg(wins.map((x) => x.holdMin)),
    avgHoldLossMin: avg(losses.map((x) => x.holdMin)),
    best: sorted.length ? { symbol: sorted.at(-1)!.symbol, pct: sorted.at(-1)!.pct } : null,
    worst: sorted.length ? { symbol: sorted[0]!.symbol, pct: sorted[0]!.pct } : null,
    hand: side(false),
    strategies: side(true),
    habits: [],
  };
  if (t.length < 3) return j;
  const h = j.habits;
  if (j.avgWinPct !== null && j.avgLossPct !== null && Math.abs(j.avgLossPct) > j.avgWinPct) h.push(`Your average loss (${j.avgLossPct.toFixed(0)}%) is bigger than your average win (+${j.avgWinPct.toFixed(0)}%): wins have to come often just to break even. A tighter stop or a later take profit fixes the shape.`);
  if (j.avgHoldWinMin !== null && j.avgHoldLossMin !== null && j.avgHoldLossMin > j.avgHoldWinMin * 2) h.push(`You hold losers ${(j.avgHoldLossMin / Math.max(1, j.avgHoldWinMin)).toFixed(1)}x longer than winners: selling what works and waiting on what does not. A stop loss and a trailing stop take that decision away.`);
  if (j.hand.closed >= 3 && j.strategies.closed >= 3 && j.hand.pnlEth < 0 && j.strategies.pnlEth > 0) h.push("Your strategies make money and your hand trades lose it. Let the rules trade more.");
  if (j.winRatePct < 30 && (j.profitFactor ?? 0) < 1) h.push(`Only ${j.winRatePct.toFixed(0)}% of trades win and the winners do not pay for the losers. Raise the ShieldBot bar or wait for stronger buying before entries.`);
  return j;
}
