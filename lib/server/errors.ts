/** Text from inside our stack that should not reach a user: Convex function paths, request ids, Privy calls, stacks. A contract-call dump sits under its first line, which is all that is kept. */
const INTERNAL = /\[CONVEX|Request ID|Uncaught|Server Error|privy (POST|PATCH)|at [\w.]+ \(/i;

/**
 * Error text that is safe to show or store: URLs (an RPC endpoint can carry its key in the path) are cut out, and an
 * error from inside the stack becomes `fallback` (logged in full on the server first).
 */
export function safeMessage(err: unknown, fallback = "Something went wrong."): string {
  const text = err instanceof Error ? err.message : typeof err === "string" ? err : fallback;
  if (INTERNAL.test(text)) {
    console.error("internal error hidden from the user:", text.replace(/\b(?:https?|wss?):\/\/\S+/gi, "[endpoint]").slice(0, 500));
    return fallback;
  }
  return text.replace(/\b(?:https?|wss?):\/\/\S+/gi, "[endpoint]").split("\n")[0]!.slice(0, 300) || fallback;
}
