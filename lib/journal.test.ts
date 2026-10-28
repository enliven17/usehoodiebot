import assert from "node:assert/strict";
import { test } from "node:test";

import { journal } from "./journal";

const MIN = 60_000;
const row = (pct: number, holdMin: number, byStrategy = false) => ({ symbol: `T${pct}`, costEth: 0.1, proceedsEth: 0.1 * (1 + pct / 100), openedAt: 0, closedAt: holdMin * MIN, byStrategy });

test("journal: win rate, profit factor, best and worst", () => {
  const j = journal([row(50, 10), row(-20, 30), row(-10, 40)])!;
  assert.equal(j.closed, 3);
  assert.ok(Math.abs(j.winRatePct - 100 / 3) < 1e-9);
  assert.ok(Math.abs(j.profitFactor! - 0.05 / 0.03) < 1e-9);
  assert.equal(j.best!.symbol, "T50");
  assert.equal(j.worst!.symbol, "T-20");
});

test("journal: names the habits behind bad numbers", () => {
  const j = journal([row(10, 5), row(-40, 60), row(-30, 50), row(5, 4)])!;
  assert.ok(j.habits.some((h) => h.includes("average loss")));
  assert.ok(j.habits.some((h) => h.includes("hold losers")));
  assert.equal(journal([]), null);
});
