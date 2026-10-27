import assert from "node:assert/strict";
import { test } from "node:test";

import { assess, type Trade } from "./shield";

const buy = (from: string, eth: number): Trade => ({ kind: "buy", from, eth, tokens: eth * 1e6, at: 0 });
const healthy = Array.from({ length: 12 }, (_, i) => buy(`0x${i}`, 0.01 + i * 0.003));
const info = { holders: { count: 300, distribution_percentage: { top_10: "40" } }, developer_address: "0xdev", developer_holding_percentage: "2", twitter_handle: "pons", gt_score: 60 };

test("a token with spread-out buyers and a quiet creator scores full", () => {
  const s = assess(info, healthy);
  assert.deepEqual(s.blocks, []);
  assert.equal(s.score, 100);
  assert.equal(s.facts.buyers, 12);
});

test("blocks: honeypot, a creator holding a lot, and one hand split across wallets", () => {
  assert.match(assess({ ...info, is_honeypot: true }, healthy).blocks[0]!, /honeypot/);
  assert.match(assess({ ...info, developer_holding_percentage: "22" }, healthy).blocks[0]!, /creator still holds 22%/);
  const split = [...healthy, ...["a", "b", "c", "d"].map((w) => buy(`0x${w}`, 0.0123457))];
  const presets = [...healthy, ...["a", "b", "c", "d", "e"].map((w) => buy(`0x${w}`, 0.005))];
  assert.deepEqual(assess(info, presets).blocks, [], "round preset sizes are not a split");
  const s = assess(info, split);
  assert.match(s.blocks[0]!, /4 different wallets bought the exact same amount/);
  assert.equal(s.score, 0);
});

test("warnings cost score: creator selling, one whale, no socials", () => {
  const trades = [...healthy, { kind: "sell", from: "0xDEV", eth: 0.2, tokens: 1, at: 0 } as Trade, buy("0xwhale", 1)];
  const s = assess({ ...info, twitter_handle: null }, trades);
  assert.deepEqual(s.blocks, []);
  assert.equal(s.warns.length, 3);
  assert.equal(s.score, 55);
});
