import assert from "node:assert/strict";
import { test } from "node:test";
import { GeckoClient } from "./gecko";

function setup(replies: Response[]) {
  let time = 1_000_000;
  const calls: string[] = [];
  const client = new GeckoClient((async (url) => {
    calls.push(String(url));
    const reply = replies.shift();
    assert.ok(reply, "unexpected upstream request");
    return reply;
  }) as typeof fetch, () => time, async (ms) => { time += ms; });
  return { client, calls, advance: (ms: number) => { time += ms; } };
}

test("Gecko: concurrent consumers share one upstream request", async () => {
  const { client, calls } = setup([Response.json({ score: 42 })]);
  const [a, b] = await Promise.all([client.get("info"), client.get("info")]);
  assert.deepEqual(a, { score: 42 });
  assert.equal(a, b);
  assert.equal(calls.length, 1);
});

test("Gecko: 429 pauses other endpoints and respects Retry-After", async () => {
  const { client, calls, advance } = setup([new Response(null, { status: 429, headers: { "retry-after": "120" } }), Response.json({ ok: true })]);
  await assert.rejects(client.get("info"), /429/);
  await assert.rejects(client.get("trades"), /429/);
  advance(61_000);
  await assert.rejects(client.get("info"), /429/);
  assert.equal(calls.length, 1);
  advance(60_000);
  assert.deepEqual(await client.get("info"), { ok: true });
  assert.equal(calls.length, 2);
});

test("Gecko: last good data survives a limit but expires after ten minutes", async () => {
  const { client, calls, advance } = setup([Response.json({ price: 1 }), new Response(null, { status: 429 }), new Response(null, { status: 503 })]);
  await client.get("price", 1000);
  advance(2000);
  assert.deepEqual(await client.get("price", 1000), { price: 1 });
  advance(11 * 60_000);
  await assert.rejects(client.get("price", 1000), /503/);
  assert.equal(calls.length, 3);
});

test("Gecko: a failed request is cached briefly rather than hammered", async () => {
  const { client, calls, advance } = setup([new Response(null, { status: 503 }), Response.json([])]);
  await assert.rejects(client.get("trades"), /503/);
  await assert.rejects(client.get("trades"), /503/);
  assert.equal(calls.length, 1);
  advance(16_000);
  assert.deepEqual(await client.get("trades"), []);
});

test("Gecko: cooldown never extends a safety read beyond its maximum age", async () => {
  const { client, calls, advance } = setup([Response.json({ score: 85 }), new Response(null, { status: 429 })]);
  await client.get("safety", 1000, 180_000);
  advance(179_000);
  assert.deepEqual(await client.get("safety", 1000, 180_000), { score: 85 });
  advance(2000);
  await assert.rejects(client.get("safety", 1000, 180_000), /429/);
  assert.equal(calls.length, 2);
});
