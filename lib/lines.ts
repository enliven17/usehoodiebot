/** Stored conversation rows (OpenAI-style chat messages) to what the client shows. Pure. */
type Message = { role: string; content?: string | null; tool_calls?: Array<{ function?: { name?: string } }> };
export type StoredRow = { id: string; role: "user" | "assistant" | "tool"; content: unknown };

export type Line = { id: string; who: "me" | "bot"; text: string; steps: Array<{ member: string; tool: string }> };

/** What the client sees: owner text, the bot's text, and which specialist ran which tool. Tool results stay hidden. */
export function toLines(rows: StoredRow[], memberOf: Record<string, string>): Line[] {
  const out: Line[] = [];
  for (const r of rows) {
    const m = (r.content ?? {}) as Message;
    const text = (typeof m.content === "string" ? m.content : "").trim();
    if (m.role === "user") {
      if (text) out.push({ id: r.id, who: "me", text, steps: [] });
      continue;
    }
    if (m.role !== "assistant") continue;
    const steps = (m.tool_calls ?? []).map((c) => ({ tool: c.function?.name ?? "", member: memberOf[c.function?.name ?? ""] ?? "hoodiebot" }));
    const last = out[out.length - 1];
    // consecutive assistant turns of one reply read as one message
    if (last?.who === "bot") {
      last.text = [last.text, text].filter(Boolean).join("\n\n");
      last.steps.push(...steps);
    } else if (text || steps.length) out.push({ id: r.id, who: "bot", text, steps });
  }
  return out;
}
