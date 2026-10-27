/** Stored conversation rows (API content blocks) to what the client shows. Pure. */
type Block = { type: string; text?: string; name?: string };
export type StoredRow = { id: string; role: "user" | "assistant"; content: unknown };

export type Line = { id: string; who: "me" | "bot"; text: string; steps: Array<{ member: string; tool: string }> };

/** What the client sees: owner text, the bot's text, and which specialist ran which tool. No raw blocks. */
export function toLines(rows: StoredRow[], memberOf: Record<string, string>): Line[] {
  const out: Line[] = [];
  for (const r of rows) {
    const blocks = typeof r.content === "string" ? [{ type: "text", text: r.content }] : (r.content as Block[]);
    const text = blocks.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n").trim();
    if (r.role === "user") {
      if (text) out.push({ id: r.id, who: "me", text, steps: [] });
      continue;
    }
    const steps = blocks.filter((b) => b.type === "tool_use").map((b) => ({ tool: b.name ?? "", member: memberOf[b.name ?? ""] ?? "hoodiebot" }));
    const last = out[out.length - 1];
    // consecutive assistant turns of one reply read as one message
    if (last?.who === "bot") {
      last.text = [last.text, text].filter(Boolean).join("\n\n");
      last.steps.push(...steps);
    } else if (text || steps.length) out.push({ id: r.id, who: "bot", text, steps });
  }
  return out;
}
