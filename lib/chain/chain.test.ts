import assert from "node:assert/strict";
import { test } from "node:test";

import { toCandidate } from "./market";
import { minOut, quoteCurveBuy, quoteCurveSell } from "./pons";
import { MAX_TRADE_WEI, robinhoodAgentPolicy } from "./policy";

const r = { quote: 1_680_000_000_000_000_000n, tokens: 1_000_000_000n * 10n ** 18n, feeBps: 100n, taxBps: 0n };

test("curve: a buy then a sell of what it bought loses only fees", () => {
  const ethIn = 10n ** 17n;
  const tokens = quoteCurveBuy(ethIn, r);
  assert.ok(tokens > 0n);
  const after = { ...r, quote: r.quote + (ethIn * 99n) / 100n, tokens: r.tokens - tokens };
  const back = quoteCurveSell(tokens, after);
  assert.ok(back < ethIn && back > (ethIn * 97n) / 100n);
});

test("minOut clamps slippage", () => {
  assert.equal(minOut(10_000n, 100), 9_900n);
  assert.equal(minOut(10_000n, -5), 10_000n);
  assert.equal(minOut(10_000n, 20_000), 0n);
});

test("market: parses a GeckoTerminal curve pool and strips the phantom quote", () => {
  const c = toCandidate(
    {
      attributes: { name: "HOOD / ETH", base_token_price_native_currency: "0.000001", quote_token_price_usd: "4000", reserve_in_usd: String(4000 * (1.68 + 2.1)), pool_created_at: new Date(0).toISOString() },
      relationships: { base_token: { data: { id: "robinhood_0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e" } } },
    },
    "curve",
    60_000,
  );
  assert.equal(c?.symbol, "HOOD");
  assert.equal(c?.ageMinutes, 1);
  assert.ok(Math.abs((c?.curvePct ?? 0) - 50) < 1e-6);
  assert.equal(toCandidate({ relationships: { base_token: { data: { id: "robinhood_nope" } } } }, "curve", 0), null);
});

test("policy: every rule pinned to chain 4663, and only the owner payout carries unbounded ETH", () => {
  const p = robinhoodAgentPolicy("0x1111111111111111111111111111111111111111", "0x2222222222222222222222222222222222222222", null);
  assert.ok(p.rules.every((rule) => rule.action === "ALLOW" && rule.conditions[0]?.value === "4663"));
  const uncapped = p.rules.filter((rule) => !rule.conditions.some((c) => c.field === "value" && c.operator === "lte"));
  assert.deepEqual(uncapped.map((r) => r.name), ["Pay the owner or the treasury"]);
  const cap = (name: string) => p.rules.find((r) => r.name === name)!.conditions.find((c) => c.field === "value")!.value;
  assert.equal(cap("Curve sell to itself"), "0x0");
  assert.equal(BigInt(cap("Curve buy to itself") as string), MAX_TRADE_WEI);
});
