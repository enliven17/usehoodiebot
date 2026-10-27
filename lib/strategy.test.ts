import assert from "node:assert/strict";
import { test } from "node:test";

import type { Candidate } from "./chain/market";
import { exitReason, exitsOf, parseSpec, rejects, ruleRows } from "./strategy";

const c = (o: Partial<Candidate>): Candidate => ({ token: "0x0000000000000000000000000000000000000001", symbol: "X", venue: "curve", priceEth: 1e-9, ageMinutes: 30, mcapUsd: 20_000, liquidityUsd: 8_000, curvePct: 10, buys1h: 30, sells1h: 10, ...o });

test("parseSpec clamps sizes and drops junk", () => {
  const s = parseSpec({ watch: "nope", sizeEth: 50, slippageBps: 1, maxOpen: 0, maxMcapUsd: -5, hack: true });
  assert.equal(s.watch, "new");
  assert.equal(s.sizeEth, 1);
  assert.equal(s.slippageBps, 50);
  assert.equal(s.maxOpen, 1);
  assert.equal(s.maxMcapUsd, undefined);
  assert.ok(!("hack" in s));
  assert.equal(parseSpec({ stopLossPct: 0, takeProfitPct: 1 }).stopLossPct, 5);
  assert.equal(parseSpec({ stopLossPct: 0, takeProfitPct: 1 }).takeProfitPct, 5);
});

test("rejects: filters and missing data fail closed", () => {
  const s = parseSpec({ watch: "new", maxMcapUsd: 60_000, minLiquidityUsd: 5_000, minBuySellRatio: 2 });
  assert.equal(rejects(s, c({})), null);
  assert.equal(rejects(s, c({ ageMinutes: 500 })), "not a new launch");
  assert.equal(rejects(s, c({ mcapUsd: 90_000 })), "market cap");
  assert.equal(rejects(s, c({ liquidityUsd: undefined })), "liquidity");
  assert.equal(rejects(s, c({ buys1h: 10, sells1h: 10 })), "buy pressure");
  assert.equal(rejects(parseSpec({ watch: "graduated" }), c({})), "not graduated");
});

test("exitReason: take profit and stop loss", () => {
  const s = parseSpec({ takeProfitPct: 80, stopLossPct: 35 });
  assert.equal(exitReason(s, 1, 1.8), "take profit");
  assert.equal(exitReason(s, 1, 0.65), "stop loss");
  assert.equal(exitReason(s, 1, 1.2), null);
  assert.equal(exitReason(s, 0, 1), null);
});

test("ruleRows reads back in words, ASCII values only", () => {
  const rows = ruleRows(parseSpec({ sizeEth: 0.01, maxMcapUsd: 60_000, minLiquidityUsd: 5_000, minCurvePct: 5, maxCurvePct: 60, maxAgeMinutes: 120, stopLossPct: 35 }));
  const get = (k: string) => rows.find((r) => r[0] === k)?.[1];
  assert.equal(get("Market cap"), "up to $60k");
  assert.equal(get("Liquidity"), "$5k or more");
  assert.equal(get("Curve"), "5% to 60%");
  assert.equal(get("Age"), "under 2h");
  assert.equal(get("Stop loss"), "-35%");
  assert.ok(rows.every(([, v]) => /^[ -~]+$/.test(v)));
});

test("exitsOf keeps exits in range and names the bad one", () => {
  assert.deepEqual(exitsOf({ takeProfitPct: 80, stopLossPct: "35" }), { takeProfitPct: 80, stopLossPct: 35 });
  assert.deepEqual(exitsOf({}), { takeProfitPct: undefined, stopLossPct: undefined });
  assert.match(exitsOf({ stopLossPct: 100 }) as string, /Stop loss/);
  assert.match(exitsOf({ takeProfitPct: 2 }) as string, /Take profit/);
});
