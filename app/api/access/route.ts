import { checkAnswers } from "@/lib/apply";
import { api, mutate } from "@/lib/db";
import { access, hoodieBalance, isAdmin, TOKEN_GATE } from "@/lib/server/access";
import { fail } from "@/lib/server/http";
import { currentOwner } from "@/lib/session";
import { clientIp, limited } from "@/lib/server/limit";

/** Where the signed-in owner stands: approved, waiting, turned down, or not applied yet. */
export async function GET() {
  const owner = await currentOwner();
  if (!owner) return fail(401, "Sign in first.");
  const slow = await limited(owner, "read");
  if (slow) return slow;
  const [status, held] = await Promise.all([access(owner), hoodieBalance(owner).catch(() => null)]);
  return Response.json({ status, admin: isAdmin(owner), token: TOKEN_GATE ? { live: true, address: TOKEN_GATE.token, min: TOKEN_GATE.min, held } : { live: false } });
}

/** Sends the application. */
export async function POST(req: Request) {
  const owner = await currentOwner();
  if (!owner) return fail(401, "Sign in first.");
  const slow = (await limited(owner, "apply")) ?? (await limited(await clientIp(), "applyIp"));
  if (slow) return slow;
  const answers = checkAnswers(((await req.json().catch(() => null)) as { answers?: unknown } | null)?.answers);
  if (typeof answers === "string") return fail(400, answers);
  // once $HOODIE is live its question answers itself: what the wallet holds, read from the chain
  const held = await hoodieBalance(owner).catch(() => null);
  if (held !== null) answers.hoodie = `holds ${Math.floor(held).toLocaleString("en-US")}`;
  const a = await mutate(api.applications.submit, { owner, answers });
  return Response.json({ status: a.status });
}
