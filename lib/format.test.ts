import assert from "node:assert/strict";
import { test } from "node:test";

import { price, usd } from "./format";

test("price writes tiny numbers with a zero count", () => {
  assert.equal(price(1.643e-9), "0.0₈1643");
  assert.equal(price(0.00012), "0.0001200");
  assert.equal(price(3.5e-5), "0.0₄35");
  assert.equal(price(2), "2.0000");
  assert.equal(price(0), "0");
});

test("usd compacts", () => {
  assert.equal(usd(12_345), "$12.3k");
  assert.equal(usd(null), "–");
});
