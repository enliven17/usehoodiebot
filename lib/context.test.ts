import assert from "node:assert/strict";
import { test } from "node:test";

import { capResult, diet, OLD_RESULT_KEEP, TOOL_RESULT_MAX } from "./context";

const big = "x".repeat(2000);

test("diet trims tool results from earlier questions and keeps the current one whole", () => {
  const w = [
    { role: "user", content: "scan" },
    { role: "assistant", content: null, tool_calls: [{}] },
    { role: "tool", tool_call_id: "a", content: big },
    { role: "assistant", content: "done" },
    { role: "user", content: "and now?" },
    { role: "assistant", content: null, tool_calls: [{}] },
    { role: "tool", tool_call_id: "b", content: big },
  ];
  const out = diet(w);
  assert.ok(out[2]!.content!.length < OLD_RESULT_KEEP + 100, "the earlier result is a trace");
  assert.equal(out[6]!.content, big, "the current result is whole");
  assert.equal(out[2]!.tool_call_id, "a", "the call id stays, so the conversation stays valid");
  assert.equal(w[2]!.content, big, "the stored rows are untouched");
});

test("capResult cuts a huge tool result", () => {
  assert.equal(capResult("short"), "short");
  assert.ok(capResult("y".repeat(TOOL_RESULT_MAX + 500)).length < TOOL_RESULT_MAX + 60);
});
