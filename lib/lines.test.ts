import assert from "node:assert/strict";
import { test } from "node:test";

import { toLines } from "./lines";

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
