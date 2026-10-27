import assert from "node:assert/strict";
import { test } from "node:test";

import { blocks, spans } from "./rich";

test("spans: bold and code, the rest as text", () => {
  assert.deepEqual(spans("**CHEMIO** is at `0x66…0946` now"), [{ text: "CHEMIO", bold: true }, { text: " is at " }, { text: "0x66…0946", code: true }, { text: " now" }]);
  assert.deepEqual(spans("2 * 3 is not bold"), [{ text: "2 * 3 is not bold" }]);
});

test("blocks: a paragraph, then a list, then a paragraph", () => {
  const b = blocks("Two tokens look alive.\n- **CHEMIO**: 26% up\n- BRH: newer\nWant one?");
  assert.equal(b.length, 3);
  assert.equal(b[0]!.type, "p");
  assert.equal(b[1]!.type === "ul" && b[1].items.length, 2);
  assert.equal(b[2]!.type === "p" && b[2].spans[0]!.text, "Want one?");
});
