/** Stored conversation rows (OpenAI-style chat messages) to what the client shows. Pure. */
type Message = { role: string; content?: string | null; tool_call_id?: string; tool_calls?: Array<{ id?: string; function?: { name?: string } }> };
export type StoredRow = { id: string; role: "user" | "assistant" | "tool"; content: unknown };

/** A trade the owner asked for in chat, laid out for them to confirm with one press. */
export type TradeCard = {
  id: string;
  side: "buy" | "sell";
  token: string;
  symbol: string;
  venue: "curve" | "graduated" | null;
  /** buy: ETH to spend; sell: share of the holding, in percent */
  ethAmount: number | null;
  pct: number | null;
  priceEth: number | null;
  mcapUsd: number | null;
  /** what comes back, fee included: tokens on a buy, ETH on a sell */
  out: number | null;
  held: number | null;
  safety: { score: number; blocked: boolean; note: string } | null;
  at: number;
  /** filled on paper, at live prices, with no real ETH */
  paper?: boolean;
  /** the transaction, once the owner confirmed it */
  done?: string;
};

export type Line = { id: string; who: "me" | "bot"; text: string; steps: Array<{ member: string; tool: string }>; cards?: TradeCard[] };

/** The tool that lays out a chat trade; its result carries the card. */
export const CARD_TOOL = "offer_trade";

/**
 * What the client sees: owner text, the bot's text, which specialist ran which tool, and trade cards. Other tool
 * results stay hidden. `done` maps a card id to the transaction that filled it.
 */
export function toLines(rows: StoredRow[], memberOf: Record<string, string>, done: Record<string, string> = {}): Line[] {
  const out: Line[] = [];
  const toolOf = new Map<string, string>();
  for (const r of rows) {
    const m = (r.content ?? {}) as Message;
    const text = (typeof m.content === "string" ? m.content : "").trim();
    if (m.role === "user") {
      if (text) out.push({ id: r.id, who: "me", text, steps: [] });
      continue;
    }
    if (m.role === "tool") {
      const last = out[out.length - 1];
      if (toolOf.get(m.tool_call_id ?? "") !== CARD_TOOL || last?.who !== "bot") continue;
      try {
        const card = (JSON.parse(text) as { card?: TradeCard }).card;
        if (card) (last.cards ??= []).push({ ...card, id: m.tool_call_id!, ...(done[m.tool_call_id!] ? { done: done[m.tool_call_id!] } : {}) });
      } catch {
        /* an error result: no card */
      }
      continue;
    }
    if (m.role !== "assistant") continue;
    for (const c of m.tool_calls ?? []) if (c.id) toolOf.set(c.id, c.function?.name ?? "");
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
