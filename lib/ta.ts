/**
 * Technical reads and a strategy replay on Pons candles. Pure. The ideas follow Vibe-Trading's technical-basic and
 * backtest skills (github.com/HKUDS/Vibe-Trading, MIT), rebuilt here for memecoin candles in ETH.
 */
import { exitReason, type Exits } from "./strategy";

export type Bar = { time: number; open: number; high: number; low: number; close: number; volume: number };

export function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  values.forEach((v, i) => out.push(i === 0 ? v : v * k + out[i - 1]! * (1 - k)));
  return out;
}

/** Wilder's RSI over the closes; null until there are `period` changes. */
export function rsi(closes: number[], period = 14): number | null {
  if (closes.length <= period) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i]! - closes[i - 1]!;
    if (d > 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i]! - closes[i - 1]!;
    gain = (gain * (period - 1) + Math.max(0, d)) / period;
    loss = (loss * (period - 1) + Math.max(0, -d)) / period;
  }
  return loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
}

export type Read = {
  bars: number;
  price: number;
  /** percent change over the window */
  changePct: number;
  /** percent below the window's high */
  fromHighPct: number;
  trend: "up" | "down" | "flat";
  rsi: number | null;
  /** last bar's volume against the average of the 20 before it */
  volumeSpike: number | null;
  /** close against the volume-weighted average price of the window, percent */
  vsVwapPct: number | null;
  signals: string[];
};

/** What the candles say: trend (EMA 9 over 21), RSI, volume spike, VWAP and distance from the high, in plain words. */
export function readBars(bars: Bar[]): Read | null {
  if (bars.length < 5) return null;
  const closes = bars.map((b) => b.close);
  const price = closes.at(-1)!;
  const high = Math.max(...bars.map((b) => b.high));
  const fast = ema(closes, 9).at(-1)!;
  const slow = ema(closes, 21).at(-1)!;
  const trend = fast > slow * 1.01 ? "up" : fast < slow * 0.99 ? "down" : "flat";
  const r = rsi(closes);
  const prior = bars.slice(-21, -1);
  const avgVol = prior.length ? prior.reduce((t, b) => t + b.volume, 0) / prior.length : 0;
  const volumeSpike = avgVol > 0 ? bars.at(-1)!.volume / avgVol : null;
  const vol = bars.reduce((t, b) => t + b.volume, 0);
  const vwap = vol > 0 ? bars.reduce((t, b) => t + ((b.high + b.low + b.close) / 3) * b.volume, 0) / vol : null;
  const read: Read = {
    bars: bars.length,
    price,
    changePct: (price / bars[0]!.open - 1) * 100,
    fromHighPct: (1 - price / high) * 100,
    trend,
    rsi: r,
    volumeSpike,
    vsVwapPct: vwap ? (price / vwap - 1) * 100 : null,
    signals: [],
  };
  const s = read.signals;
  if (trend === "up") s.push("Short average above the long one: buyers in control.");
  if (trend === "down") s.push("Short average under the long one: sellers in control.");
  if (r !== null && r >= 75) s.push(`RSI ${r.toFixed(0)}: stretched, a pullback is likely before more upside.`);
  if (r !== null && r <= 30) s.push(`RSI ${r.toFixed(0)}: washed out, sellers may be done.`);
  if (volumeSpike !== null && volumeSpike >= 3) s.push(`Volume ${volumeSpike.toFixed(1)}x the recent average on the last candle.`);
  if (read.fromHighPct >= 50) s.push(`${read.fromHighPct.toFixed(0)}% below its high: it already dumped once.`);
  else if (read.fromHighPct <= 5 && read.changePct > 20) s.push("At its high after a run: chasing here is the risky entry.");
  if (read.vsVwapPct !== null && Math.abs(read.vsVwapPct) >= 15) s.push(`${read.vsVwapPct > 0 ? "Above" : "Below"} its average traded price by ${Math.abs(read.vsVwapPct).toFixed(0)}%.`);
  return read;
}

/** What one replayed trade did. */
export type Replay = { returnPct: number; reason: "take profit" | "stop loss" | "trailing stop" | "still open"; heldBars: number };

/**
 * Buys at the first bar's close (after `skipBars`), then walks the bars applying the exits on each bar's low (stops)
 * and high (targets), the way the minute tick would. `costPct` is the round trip in fees, taken off the result.
 * ponytail: one fill price per bar, no slippage model beyond costPct; a tick that runs every minute sees about this.
 */
export function replay(bars: Bar[], exits: Exits, costPct: number, skipBars = 0): Replay | null {
  const entryBar = bars[skipBars];
  if (!entryBar || !(entryBar.close > 0)) return null;
  const entry = entryBar.close;
  let peak = entry;
  for (let i = skipBars + 1; i < bars.length; i++) {
    const b = bars[i]!;
    // stops first on a bar that touched both: the cautious reading
    for (const px of [b.low, b.high, b.close]) {
      const why = exitReason(exits, entry, px, peak);
      if (why) {
        const at = why === "take profit" ? entry * (1 + (exits.takeProfitPct ?? 0) / 100) : why === "stop loss" ? entry * (1 - (exits.stopLossPct ?? 0) / 100) : peak * (1 - (exits.trailingStopPct ?? 0) / 100);
        return { returnPct: (at / entry - 1) * 100 - costPct, reason: why, heldBars: i - skipBars };
      }
      peak = Math.max(peak, px);
    }
  }
  return { returnPct: (bars.at(-1)!.close / entry - 1) * 100 - costPct, reason: "still open", heldBars: bars.length - 1 - skipBars };
}

export type Backtest = { trades: number; wins: number; winRatePct: number; avgReturnPct: number; medianReturnPct: number; bestPct: number; worstPct: number; profitFactor: number | null; pnlEth: number; maxDrawdownEth: number };

/** The replays summed up, with the P&L of `sizeEth` per trade taken in order. */
export function summarize(results: Replay[], sizeEth: number): Backtest | null {
  if (!results.length) return null;
  const r = results.map((x) => x.returnPct);
  const sorted = [...r].sort((a, b) => a - b);
  const wins = r.filter((x) => x > 0);
  const losses = r.filter((x) => x <= 0);
  let equity = 0;
  let top = 0;
  let dd = 0;
  for (const x of r) {
    equity += (sizeEth * x) / 100;
    top = Math.max(top, equity);
    dd = Math.max(dd, top - equity);
  }
  const lossSum = -losses.reduce((a, b) => a + b, 0);
  return {
    trades: r.length,
    wins: wins.length,
    winRatePct: (wins.length / r.length) * 100,
    avgReturnPct: r.reduce((a, b) => a + b, 0) / r.length,
    medianReturnPct: sorted[Math.floor(sorted.length / 2)]!,
    bestPct: sorted.at(-1)!,
    worstPct: sorted[0]!,
    profitFactor: lossSum > 0 ? wins.reduce((a, b) => a + b, 0) / lossSum : null,
    pnlEth: equity,
    maxDrawdownEth: dd,
  };
}
