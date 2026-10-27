import assert from "node:assert/strict";
import { test } from "node:test";

import { safeMessage } from "./errors";

test("safeMessage drops endpoints and keeps the first line", () => {
  assert.equal(safeMessage(new Error("HTTP request failed.\nURL: https://rpc.example.com/v2/SECRETKEY")), "HTTP request failed.");
  assert.equal(safeMessage(new Error("fetch https://rpc.example.com/v2/SECRETKEY timed out")), "fetch [endpoint] timed out");
  assert.equal(safeMessage(42), "Something went wrong.");
});
