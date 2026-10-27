import assert from "node:assert/strict";
import { test } from "node:test";

import { toLines } from "./lines";

test("toLines: one reply across tool turns reads as one message; tool results and thinking stay hidden", () => {
  const lines = toLines(
    [
      { id: "1", role: "user", content: [{ type: "text", text: "find me something" }] },
      { id: "2", role: "assistant", content: [{ type: "thinking", thinking: "" }, { type: "tool_use", name: "scan_market", id: "a", input: {} }] },
      { id: "3", role: "user", content: [{ type: "tool_result", tool_use_id: "a", content: "[]" }] },
      { id: "4", role: "assistant", content: [{ type: "text", text: "LODGER looks good." }] },
    ],
    { scan_market: "research" },
  );
  assert.deepEqual(lines, [
    { id: "1", who: "me", text: "find me something", steps: [] },
    { id: "2", who: "bot", text: "LODGER looks good.", steps: [{ tool: "scan_market", member: "research" }] },
  ]);
});
