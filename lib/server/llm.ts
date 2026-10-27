import "server-only";

import { createHash } from "node:crypto";

/**
 * Chat with tools over the OpenAI-compatible endpoints of Gemini, Groq and OpenRouter, using every key that is set
 * (GEMINI_API_KEYS, GROQ_API_KEYS, OPENROUTER_API_KEYS; comma separated). Providers are tried in order, keys in turn;
 * a key that is rate limited or failing sits out a cooldown, the call moves on. Keys never reach logs or errors.
 */

export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
export type ToolDef = { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } };

type Provider = { name: string; url: string; models: string[]; keys: string[]; cooldownMs: number; headers?: Record<string, string> };

const list = (...values: Array<string | undefined>) => [...new Set(values.flatMap((v) => (v ?? "").split(/[,\s]+/)).map((k) => k.trim()).filter(Boolean))];

/**
 * Order, measured 2026-10-27 with a tool call on each key: OpenRouter (Claude Sonnet 5.5, ~1.7 s, the best judgment
 * for money decisions) first, Groq (Qwen, ~0.2 s, free) next, Gemini direct last (flash was answering 503, lite ~24 s).
 * Each provider also tries its models in order. Override with *_MODELS (comma separated).
 */
function providers(env = process.env): Provider[] {
  return [
    {
      name: "openrouter", url: "https://openrouter.ai/api/v1/chat/completions", models: list(env.OPENROUTER_MODELS).length ? list(env.OPENROUTER_MODELS) : ["anthropic/claude-sonnet-5-5", "google/gemini-3.5-flash"],
      keys: list(env.OPENROUTER_API_KEYS, env.OPENROUTER_API_KEY), cooldownMs: 15 * 60_000,
      headers: { "HTTP-Referer": env.NEXT_PUBLIC_SITE_URL ?? "https://usehoodiebot.com", "X-Title": "HOODIEBOT" },
    },
    { name: "groq", url: "https://api.groq.com/openai/v1/chat/completions", models: list(env.GROQ_MODELS).length ? list(env.GROQ_MODELS) : ["qwen/qwen3.8-27b"], keys: list(env.GROQ_API_KEYS, env.GROQ_API_KEY), cooldownMs: 15 * 60_000 },
    { name: "gemini", url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", models: list(env.GEMINI_MODELS).length ? list(env.GEMINI_MODELS) : ["gemini-3.5-flash", "gemini-3.5-flash-lite"], keys: list(env.GEMINI_API_KEYS, env.GEMINI_API_KEY), cooldownMs: 5 * 60_000 },
  ].filter((p) => p.keys.length);
}

const cooldown = new Map<string, number>();
const keyId = (key: string) => createHash("sha256").update(key).digest("hex").slice(0, 8);

export type Completion = { message: Extract<ChatMessage, { role: "assistant" }>; provider: string; model: string };

/** One assistant turn. Throws only when every provider and key failed. */
export async function complete(a: { messages: ChatMessage[]; tools: ToolDef[]; maxTokens?: number }): Promise<Completion> {
  const all = providers();
  if (!all.length) throw new Error("No LLM key is configured (GEMINI_API_KEYS, GROQ_API_KEYS or OPENROUTER_API_KEYS).");
  const failures: string[] = [];
  // Every provider, then each of its models, then each key: the first answer wins.
  const attempts = all.flatMap((p) => p.models.flatMap((model) => p.keys.map((key) => ({ p, model, key }))));
  for (const { p, model, key } of attempts) {
    const id = `${p.name}:${model}:${keyId(key)}`;
    if ((cooldown.get(id) ?? 0) > Date.now()) continue;
    try {
      const res = await fetch(p.url, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json", ...p.headers },
        body: JSON.stringify({ model, messages: a.messages, tools: a.tools, tool_choice: "auto", temperature: 0.3, max_tokens: a.maxTokens ?? 2048 }),
        signal: AbortSignal.timeout(60_000),
      });
      if (res.status === 429 || res.status >= 500 || res.status === 401 || res.status === 403) {
        cooldown.set(id, Date.now() + p.cooldownMs);
        failures.push(`${id} ${res.status}`);
        continue;
      }
      // Gemini wraps its errors in an array: [{ error: { message } }]
      const raw = (await res.json().catch(() => null)) as unknown;
      const body = (Array.isArray(raw) ? raw[0] : raw) as { choices?: Array<{ message?: { content?: string | null; tool_calls?: ToolCall[] } }>; error?: { message?: string } } | null;
      const msg = body?.choices?.[0]?.message;
      // A 4xx here is this model's problem (an invented tool name, an unknown slug): move on, no cooldown.
      if (!res.ok || !msg) {
        failures.push(`${id} ${res.status} ${(body?.error?.message ?? "").slice(0, 80)}`);
        // out of credit (402) or quota: this key will not work for a while either
        if (res.status === 402) cooldown.set(id, Date.now() + p.cooldownMs);
        continue;
      }
      const toolCalls = (msg.tool_calls ?? []).map((c, i) => ({ id: c.id || `call_${Date.now()}_${i}`, type: "function" as const, function: { name: c.function.name, arguments: c.function.arguments || "{}" } }));
      return { message: { role: "assistant", content: msg.content ?? null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) }, provider: p.name, model };
    } catch (err) {
      cooldown.set(id, Date.now() + 60_000);
      failures.push(`${id} ${err instanceof Error ? err.name : "error"}`);
    }
  }
  console.error("llm: every provider failed", failures.join("; "));
  throw new Error("The team's brain is busy right now. Try again in a minute.");
}
