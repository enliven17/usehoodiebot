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
const team = (await step("team (privy wallet + policy)", () => call("/api/team", { method: "POST" }))) as { wallet: string; spendableEth: string };
console.log("    team wallet", team.wallet, "spendable", team.spendableEth);
const chat = (await step("chat", () => call("/api/chat", { method: "POST", json: { text: "What is moving on Pons right now? Keep it short." } }))) as { lines: Array<{ who: string; text: string; steps: Array<{ member: string; tool: string }> }> };
const reply = chat.lines.at(-1)!;
console.log("    steps", reply.steps.map((s) => `${s.member}:${s.tool}`).join(", ") || "none");
console.log("    reply", reply.text.slice(0, 300).replace(/\n/g, " "));
const snap = (await step("snapshot", () => call("/api/team"))) as { events: Array<{ member: string; text: string }> };
console.log("    events", snap.events.map((e) => `${e.member}: ${e.text}`).slice(0, 4));

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
