import assert from "node:assert/strict";
import { test } from "node:test";

process.env.SESSION_SECRET = "x".repeat(32);
const { seal, unseal } = await import("./seal");

test("session: a sealed value round-trips, a tampered or expired one does not", () => {
  const s = seal("0xabc", 1000, 0);
  assert.equal(unseal(s, 500), "0xabc");
  assert.equal(unseal(s, 1500), null);
  assert.equal(unseal(s.replace("0xabc", "0xabd"), 500), null);
  assert.equal(unseal(undefined), null);
});
