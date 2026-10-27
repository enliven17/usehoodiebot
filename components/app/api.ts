import type { Line } from "@/lib/lines";
import type { Snapshot } from "@/lib/server/snapshot";

export type { Line, Snapshot };

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
  newChat: () => call<{ lines: Line[] }>("/api/chat/new", { method: "POST" }),
  decide: (id: string, approve: boolean) => call<{ status: string; result: { hash?: string; error?: string } | null }>(`/api/approvals/${id}`, { method: "POST", json: { approve } }),
  strategy: (id: string, patch: { active?: boolean; mode?: "ask" | "auto" }) => call(`/api/strategies/${id}`, { method: "PATCH", json: patch }),
  deleteStrategy: (id: string) => call(`/api/strategies/${id}`, { method: "DELETE" }),
  withdraw: (eth: string) => call<{ hash: string }>("/api/withdraw", { method: "POST", json: { eth } }),
  nonce: () => call<{ nonce: string }>("/api/auth/nonce"),
  verify: (address: string, signature: string) => call<{ owner: string }>("/api/auth/verify", { method: "POST", json: { address, signature } }),
  logout: () => call("/api/auth/logout", { method: "POST" }),
};
