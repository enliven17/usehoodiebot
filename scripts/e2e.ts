// End-to-end check against a running app: sign in with a throwaway key, create the team, chat once, read the snapshot.
// npx tsx scripts/e2e.ts [baseUrl]   (creates a real, empty Privy wallet for the throwaway owner)
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";

import { signInMessage } from "../lib/sign-in-message";

const base = process.argv[2] ?? "http://localhost:3011";
const jar = new Map<string, string>();
async function call(path: string, init: RequestInit & { json?: unknown } = {}) {
  const res = await fetch(base + path, {
    ...init,
    headers: { ...(init.json !== undefined ? { "content-type": "application/json" } : {}), cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") },
    body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
  });
  for (const c of res.headers.getSetCookie()) {
    const [kv] = c.split(";");
    const i = kv!.indexOf("=");
    jar.set(kv!.slice(0, i), kv!.slice(i + 1));
  }
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) throw new Error(`${path} ${res.status}: ${JSON.stringify(body)}`);
  return body!;
}

const step = async <T>(name: string, fn: () => Promise<T>) => {
  const t = Date.now();
  const out = await fn();
  console.log(`ok  ${name} (${Date.now() - t} ms)`);
  return out;
};

const account = privateKeyToAccount(generatePrivateKey());
const { nonce } = (await step("nonce", () => call("/api/auth/nonce"))) as { nonce: string };
const signature = await account.signMessage({ message: signInMessage(account.address, nonce) });
await step("verify", () => call("/api/auth/verify", { method: "POST", json: { address: account.address, signature } }));

// the waitlist: a new owner applies; unless the app runs with OPEN_ACCESS=1 (local), no team wallet until an admin approves
const before = (await step("access", () => call("/api/access"))) as { status: string };
console.log("    access", before.status);
if (before.status !== "approved") {
  const answers = { x: "hoodie_e2e", telegram: "hoodie_e2e", experience: "Seasoned, 1 to 3 years", volume: "1 to 10 ETH", purpose: ["Snipe new Pons launches"], why: "End to end check of the waitlist flow." };
  const sent = (await step("apply", () => call("/api/access", { method: "POST", json: { answers } }))) as { status: string };
  if (sent.status !== "pending") throw new Error(`application is ${sent.status}`);
  const blocked = await call("/api/team", { method: "POST" }).catch((e: Error) => e.message);
  if (typeof blocked !== "string" || !/403/.test(blocked)) throw new Error(`team was not gated: ${JSON.stringify(blocked)}`);
  console.log("ok  on the waitlist, team creation refused until approved");
  process.exit(0);
}
const team = (await step("team (privy wallet + policy)", () => call("/api/team", { method: "POST" }))) as { wallet: string; spendableEth: string };
console.log("    team wallet", team.wallet, "spendable", team.spendableEth);
const chat = (await step("chat", () => call("/api/chat", { method: "POST", json: { text: "What is moving on Pons right now? Keep it short." } }))) as { lines: Array<{ who: string; text: string; steps: Array<{ member: string; tool: string }> }> };
const reply = chat.lines.at(-1)!;
console.log("    steps", reply.steps.map((s) => `${s.member}:${s.tool}`).join(", ") || "none");
console.log("    reply", reply.text.slice(0, 300).replace(/\n/g, " "));
const snap = (await step("snapshot", () => call("/api/team"))) as { events: Array<{ member: string; text: string }> };
console.log("    events", snap.events.map((e) => `${e.member}: ${e.text}`).slice(0, 4));

// past chats: start a new one, the first shows up in the list and reopens with its lines
const first = (await step("new chat", () => call("/api/chat/new", { method: "POST" })).then(() => call("/api/chat/threads"))) as { threads: Array<{ thread: number; title: string }> };
console.log("    chats", first.threads.map((t) => `${t.thread}: ${t.title.slice(0, 40)}`));
const reopened = (await step("reopen chat", () => call("/api/chat/open", { method: "POST", json: { thread: first.threads[0]!.thread } }))) as { lines: unknown[] };
if (!reopened.lines.length) throw new Error("reopened chat is empty");

// trade screen: token list, candles for the busiest one, and a hand buy refused for lack of ETH (nothing is sent)
const market = (await step("market list", () => call("/api/market"))) as { tokens: Array<{ token: string; symbol: string }> };
const pick = market.tokens[0]!;
const asked = (await step(`ask about ${pick.symbol}`, () => call("/api/chat", { method: "POST", json: { text: `Should I buy 0.01 ETH of ${pick.token}? Check it properly first.` } }))) as { lines: Array<{ text: string; steps: Array<{ member: string; tool: string }> }> };
const verdict = asked.lines.at(-1)!;
console.log("    steps", verdict.steps.map((x) => `${x.member}:${x.tool}`).join(", "));
console.log("    reply", verdict.text.slice(0, 400).replaceAll("\n", " "));
if (!verdict.steps.some((x) => x.tool === "check_safety")) throw new Error("ShieldBot was not asked before a buy");
const view = (await step(`token ${pick.symbol}`, () => call(`/api/market/${pick.token}`))) as { market: { pool: string } | null; held: number | null };
console.log("    pool", view.market?.pool, "held", view.held);
const q = (await step("quote 0.001 ETH", () => call(`/api/quote?token=${pick.token}&side=buy&eth=0.001`))) as { in: number; out: number; spot: number | null };
console.log("    quote", q);
if (!(q.out > 0)) throw new Error("quote returned nothing");
const noPos = await call("/api/exits", { method: "POST", json: { token: pick.token, takeProfitPct: 80 } }).catch((e: Error) => e.message);
if (typeof noPos !== "string" || !/No position/.test(noPos)) throw new Error(`exits without a position: ${JSON.stringify(noPos)}`);
const refused = await call("/api/trade", { method: "POST", json: { side: "buy", token: pick.token, symbol: pick.symbol, eth: "0.001", slippageBps: 500, takeProfitPct: 80, stopLossPct: 35 } }).catch((e: Error) => e.message);
if (typeof refused !== "string" || !/ETH to trade/.test(refused)) throw new Error(`hand buy was not refused: ${JSON.stringify(refused)}`);
console.log("ok  hand buy refused:", refused.slice(0, 90));

// --strategy: save a loose strategy through chat, wait for the minute tick to match a token, then approve it. The
// throwaway wallet holds no ETH, so the approval must fail safely with the balance message (no transaction is sent).
if (process.argv.includes("--strategy")) {
  await step("strategy via chat", () =>
    call("/api/chat", { method: "POST", json: { text: "Save a strategy named E2E: watch all Pons tokens, 0.001 ETH per entry, no other filters. Do not ask me anything, just save it." } }),
  );
  const saved = (await call("/api/team")) as { strategies: Array<{ name: string; mode: string }> };
  console.log("    strategies", saved.strategies.map((s) => `${s.name} (${s.mode})`));
  let ask: { id: string; symbol: string } | undefined;
  for (let i = 0; i < 18 && !ask; i++) {
    await new Promise((r) => setTimeout(r, 10_000));
    const snap = (await call("/api/team")) as { approvals: Array<{ id: string; symbol: string; status: string }> };
    ask = snap.approvals.find((a) => a.status === "pending");
  }
  if (!ask) throw new Error("no approval appeared within 3 minutes");
  console.log("ok  tick matched and asked:", ask.symbol);
  const decided = (await call(`/api/approvals/${ask.id}`, { method: "POST", json: { approve: true } })) as { status: string; result: { error?: string } };
  console.log(`ok  approve -> ${decided.status}: ${decided.result?.error}`);
  const snap = (await call("/api/team")) as { events: Array<{ member: string; kind: string; text: string }>; strategies: Array<{ id: string }> };
  console.log("    events", snap.events.slice(0, 5).map((e) => `${e.member}/${e.kind}: ${e.text}`));
  // the throwaway team must not keep matching every minute
  for (const s of snap.strategies) await call(`/api/strategies/${s.id}`, { method: "DELETE" });
  console.log("ok  cleaned up the test strategy");
}
