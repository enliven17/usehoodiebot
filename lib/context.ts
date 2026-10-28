/**
 * What the model is sent each step. Every step resends the whole window, so a run's cost grows with the square of its
 * length: the evidence of earlier questions (tool results the owner already got an answer from) goes in as a short
 * trace, and only the current question's tool results go in full. After rgk_degen's "pricing turns" (x.com/rgk_degen).
 */
type Msg = { role: string; content?: string | null; tool_calls?: unknown[]; tool_call_id?: string };

/** The longest a tool result is stored and sent, in characters (about 1,500 tokens). */
export const TOOL_RESULT_MAX = 6000;
/** What is kept of an earlier question's tool result. */
export const OLD_RESULT_KEEP = 280;

export const capResult = (s: string) => (s.length > TOOL_RESULT_MAX ? `${s.slice(0, TOOL_RESULT_MAX)}… (cut at ${TOOL_RESULT_MAX} characters)` : s);

/** The window with tool results before the latest owner message cut to a trace. Pure; the stored rows are untouched. */
export function diet<T extends Msg>(window: T[]): T[] {
  let lastUser = -1;
  window.forEach((m, i) => m.role === "user" && (lastUser = i));
  return window.map((m, i) =>
    i < lastUser && m.role === "tool" && typeof m.content === "string" && m.content.length > OLD_RESULT_KEEP
      ? { ...m, content: `${m.content.slice(0, OLD_RESULT_KEEP)}… (earlier result, trimmed; ask the tool again if you need it)` }
      : m,
  );
}
