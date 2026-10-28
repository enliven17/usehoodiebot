import assert from "node:assert/strict";
import { test } from "node:test";

import { safeMessage } from "./errors";

test("safeMessage drops endpoints and keeps the first line", () => {
  assert.equal(safeMessage(new Error("HTTP request failed.\nURL: https://rpc.example.com/v2/SECRETKEY")), "HTTP request failed.");
  assert.equal(safeMessage(new Error("fetch https://rpc.example.com/v2/SECRETKEY timed out")), "fetch [endpoint] timed out");
  assert.equal(safeMessage(42), "Something went wrong.");
});

test("safeMessage hides errors from inside the stack", () => {
  assert.equal(safeMessage(new Error("[CONVEX M(book:bought)] [Request ID: 1a2b] Server Error")), "Something went wrong.");
  assert.equal(safeMessage(new Error("The contract function \"buy\" reverted.\n\nContract Call:\n  address: 0x1")), "The contract function \"buy\" reverted.");
  assert.equal(safeMessage(new Error("The wallet has 0 ETH to trade; this needs 0.001.")), "The wallet has 0 ETH to trade; this needs 0.001.");
});
