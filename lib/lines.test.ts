import assert from "node:assert/strict";
import { test } from "node:test";

import { toLines, type StoredRow } from "./lines";

test("toLines: one reply across tool turns reads as one message; tool results stay hidden", () => {
  const lines = toLines(
    [
      { id: "1", role: "user", content: { role: "user", content: "find me something" } },
      { id: "2", role: "assistant", content: { role: "assistant", content: null, tool_calls: [{ id: "a", type: "function", function: { name: "scan_market", arguments: "{}" } }] } },
      { id: "3", role: "tool", content: { role: "tool", tool_call_id: "a", content: "[]" } },
      { id: "4", role: "assistant", content: { role: "assistant", content: "LODGER looks good." } },
    ],
    { scan_market: "research" },
  );
  assert.deepEqual(lines, [
    { id: "1", who: "me", text: "find me something", steps: [] },
    { id: "2", who: "bot", text: "LODGER looks good.", steps: [{ tool: "scan_market", member: "research" }] },
  ]);
});

test("toLines: a trade card from offer_trade lands on the reply, marked done once confirmed", () => {
  const card = { side: "buy", token: "0xabc", symbol: "PEPE", venue: "curve", ethAmount: 0.01, pct: null, priceEth: 1e-9, mcapUsd: 9000, out: 9e6, held: null, safety: null, at: 1 };
  const rows: StoredRow[] = [
    { id: "1", role: "user", content: { role: "user", content: "buy 0.01 pepe" } },
    { id: "2", role: "assistant", content: { role: "assistant", content: null, tool_calls: [{ id: "c1", function: { name: "offer_trade" } }, { id: "c2", function: { name: "scan_market" } }] } },
    { id: "3", role: "tool", content: { role: "tool", tool_call_id: "c1", content: JSON.stringify({ card }) } },
    { id: "4", role: "tool", content: { role: "tool", tool_call_id: "c2", content: JSON.stringify({ card }) } },
    { id: "5", role: "assistant", content: { role: "assistant", content: "Did you mean this one?" } },
  ];
  const [, bot] = toLines(rows, { offer_trade: "trader" }, { c1: "0xhash" });
  assert.equal(bot!.cards?.length, 1, "only offer_trade results become cards");
  assert.equal(bot!.cards![0]!.id, "c1");
  assert.equal(bot!.cards![0]!.done, "0xhash");
  assert.equal(bot!.text, "Did you mean this one?");
});
