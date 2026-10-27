/** Error text that is safe to show or store: URLs (an RPC endpoint can carry its key in the path) are cut out. */
export function safeMessage(err: unknown, fallback = "Something went wrong."): string {
  const text = err instanceof Error ? err.message : typeof err === "string" ? err : fallback;
  return text.replace(/\b(?:https?|wss?):\/\/\S+/gi, "[endpoint]").split("\n")[0]!.slice(0, 300) || fallback;
}
