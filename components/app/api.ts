import type { Candidate } from "@/lib/chain/market";
import type { Line } from "@/lib/lines";
import type { Snapshot } from "@/lib/server/snapshot";

import type { Fill } from "./Chart";

export type { Line, Snapshot };
export type Access = "approved" | "pending" | "rejected" | "none" | "needs_token";
export type TokenGate = { live: false } | { live: true; address: string; min: number; held: number | null };
export type Chat = { thread: number; title: string; at: number; open: boolean };
export type MarketToken = Partial<Candidate> & { token: string; symbol: string; group: "held" | "traded" | "market" };
export type TokenView = {
  market: (Candidate & { pool: string }) | null;
  trades: Fill[];
  position: { tokens: number; costEth: number; takeProfitPct: number | null; stopLossPct: number | null; trailingStopPct: number | null; hand: boolean } | null;
  held: number | null;
};
export type Quote = { in: number; out: number; spot: number | null; feePct?: number };
type Exits = { takeProfitPct?: string; stopLossPct?: string; trailingStopPct?: string };

async function call<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: init?.json !== undefined ? { "content-type": "application/json" } : undefined,
    body: init?.json !== undefined ? JSON.stringify(init.json) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw Object.assign(new Error(data.error ?? `Request failed (${res.status})`), { status: res.status });
  return data;
}

export const api = {
  team: () => call<Snapshot>("/api/team"),
  createTeam: () => call<Snapshot>("/api/team", { method: "POST" }),
  lines: () => call<{ lines: Line[] }>("/api/chat"),
  send: (text: string) => call<{ lines: Line[] }>("/api/chat", { method: "POST", json: { text } }),
  chats: () => call<{ threads: Chat[] }>("/api/chat/threads"),
  openChat: (thread: number) => call<{ lines: Line[] }>("/api/chat/open", { method: "POST", json: { thread } }),
  market: () => call<{ tokens: MarketToken[] }>("/api/market"),
  token: (token: string) => call<TokenView>(`/api/market/${token}`),
  quote: (q: { token: string; side: "buy" | "sell"; eth?: string; pct?: number }) => call<Quote>(`/api/quote?${new URLSearchParams(Object.entries(q).map(([k, v]) => [k, String(v)]))}`),
  trade: (t: { side: "buy" | "sell"; token: string; symbol: string; slippageBps: number; eth?: string; pct?: number } & Exits) => call<{ hash: string; pending?: boolean }>("/api/trade", { method: "POST", json: t }),
  exits: (e: { token: string } & Exits) => call<{ ok: true }>("/api/exits", { method: "POST", json: e }),
  newChat: () => call<{ lines: Line[] }>("/api/chat/new", { method: "POST" }),
  decide: (id: string, approve: boolean) => call<{ status: string; result: { hash?: string; error?: string } | null }>(`/api/approvals/${id}`, { method: "POST", json: { approve } }),
  autopilot: (on: boolean, budgetEth: number) => call<{ ok: true }>("/api/autopilot", { method: "POST", json: { on, budgetEth } }),
  createStrategy: (s: { name: string; spec: Record<string, unknown>; mode: "ask" | "auto" }) => call<{ id: string }>("/api/strategies", { method: "POST", json: s }),
  strategy: (id: string, patch: { active?: boolean; mode?: "ask" | "auto" }) => call(`/api/strategies/${id}`, { method: "PATCH", json: patch }),
  deleteStrategy: (id: string) => call(`/api/strategies/${id}`, { method: "DELETE" }),
  withdraw: (eth: string) => call<{ hash: string }>("/api/withdraw", { method: "POST", json: { eth } }),
  access: () => call<{ status: Access; admin: boolean; token: TokenGate }>("/api/access"),
  apply: (answers: Record<string, string | string[]>) => call<{ status: Access }>("/api/access", { method: "POST", json: { answers } }),
  nonce: () => call<{ nonce: string }>("/api/auth/nonce"),
  verify: (address: string, signature: string) => call<{ owner: string }>("/api/auth/verify", { method: "POST", json: { address, signature } }),
  logout: () => call("/api/auth/logout", { method: "POST" }),
};
