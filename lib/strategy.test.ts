import assert from "node:assert/strict";
import { test } from "node:test";

import type { Candidate } from "./chain/market";
import { exitReason, parseSpec, rejects } from "./strategy";

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
