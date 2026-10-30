import assert from "node:assert/strict";
import { test } from "node:test";
import { candidatePage } from "./market";

test("market: later pages keep usable tokens and disclose partial source failures", async (t) => {
  const urls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string) => {
    urls.push(url);
    if (url.includes("/new_pools")) return new Response(null, { status: 503 });
    return Response.json({ data: [{
      attributes: { address: "0x2222222222222222222222222222222222222222", name: "MORE / WETH", base_token_price_native_currency: "0.000001" },
      relationships: { base_token: { data: { id: "robinhood_0x1111111111111111111111111111111111111111" } } },
    }] });
  });
  const result = await candidatePage(2);
  assert.equal(result.tokens.length, 1, "duplicate pools still represent one token");
  assert.equal(result.tokens[0]?.symbol, "MORE");
  assert.equal(result.incomplete, true);
  assert.equal(result.hasMore, true);
  assert.equal(urls.length, 3);
  assert.ok(urls.every((url) => new URL(url).searchParams.get("page") === "2"));
});
