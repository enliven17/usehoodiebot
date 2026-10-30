import { checkAnswers } from "@/lib/apply";
import { api, mutate } from "@/lib/db";
import { access, isAdmin, planOf } from "@/lib/server/access";
import { FEE_WALLET } from "@/lib/server/fees";
import { fail } from "@/lib/server/http";
import { clientIp, limited } from "@/lib/server/limit";
import { planList, WIF } from "@/lib/server/plans";
import { currentOwner } from "@/lib/session";

/** Where the signed-in owner stands (approved, waiting, turned down, not applied, or due a plan), their plan and the prices. */
export async function GET() {
  const owner = await currentOwner();
  if (!owner) return fail(401, "Sign in first.");
  const slow = await limited(owner, "read");
  if (slow) return slow;
  const [status, plan] = await Promise.all([access(owner), planOf(owner).catch(() => null)]);
  return Response.json({ status, admin: isAdmin(owner), plan, plans: planList(), payTo: FEE_WALLET, wif: WIF });
}

/** Sends the application. */
export async function POST(req: Request) {
  const owner = await currentOwner();
  if (!owner) return fail(401, "Sign in first.");
  const slow = (await limited(owner, "apply")) ?? (await limited(await clientIp(), "applyIp"));
  if (slow) return slow;
  const answers = checkAnswers(((await req.json().catch(() => null)) as { answers?: unknown } | null)?.answers);
  if (typeof answers === "string") return fail(400, answers);
  const a = await mutate(api.applications.submit, { owner, answers });
  return Response.json({ status: a.status });
}
