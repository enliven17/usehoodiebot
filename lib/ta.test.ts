import assert from "node:assert/strict";
import { test } from "node:test";

import { readBars, replay, rsi, summarize, type Bar } from "./ta";

const bar = (close: number, i: number, volume = 1): Bar => ({ time: i * 60, open: close, high: close, low: close, close, volume });
const series = (closes: number[]) => closes.map((c, i) => bar(c, i));

test("rsi reads a steady climb as stretched and a steady fall as washed out", () => {
  assert.equal(rsi(Array.from({ length: 30 }, (_, i) => 1 + i)), 100);
  assert.ok(rsi(Array.from({ length: 30 }, (_, i) => 100 - i * 2))! < 5);
  assert.equal(rsi([1, 2, 3]), null);
});

test("readBars: an uptrend at its high after a run says so", () => {
  const r = readBars(series(Array.from({ length: 40 }, (_, i) => 1 + i * 0.05)))!;
  assert.equal(r.trend, "up");
  assert.ok(r.fromHighPct < 1);
  assert.ok(r.signals.some((s) => s.includes("chasing")));
});

test("replay hits the take profit, the stop, or the trail, fees off", () => {
  const exits = { takeProfitPct: 50, stopLossPct: 20, trailingStopPct: 25 };
  assert.deepEqual(replay(series([1, 1.2, 1.6]), exits, 2), { returnPct: 48, reason: "take profit", heldBars: 2 });
  assert.equal(replay(series([1, 0.9, 0.7]), exits, 2)!.reason, "stop loss");
  // up 40% (under the target), then back 25% from that high
  const trail = replay(series([1, 1.4, 1.0]), exits, 0)!;
  assert.equal(trail.reason, "trailing stop");
  assert.ok(Math.abs(trail.returnPct - 5) < 1e-9);
  assert.equal(replay(series([1, 1.1]), exits, 0)!.reason, "still open");
});

test("summarize: win rate, profit factor and drawdown on a fixed size", () => {
  const s = summarize([{ returnPct: 50, reason: "take profit", heldBars: 3 }, { returnPct: -20, reason: "stop loss", heldBars: 2 }, { returnPct: -10, reason: "stop loss", heldBars: 1 }], 0.1)!;
  assert.equal(s.trades, 3);
  assert.equal(s.wins, 1);
  assert.ok(Math.abs(s.profitFactor! - 50 / 30) < 1e-9);
  assert.ok(Math.abs(s.pnlEth - 0.02) < 1e-9);
  assert.ok(Math.abs(s.maxDrawdownEth - 0.03) < 1e-9);
});
