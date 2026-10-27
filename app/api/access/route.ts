import { checkAnswers } from "@/lib/apply";
import { api, mutate } from "@/lib/db";
import { access, isAdmin } from "@/lib/server/access";
import { fail } from "@/lib/server/http";
import { currentOwner } from "@/lib/session";

/** Where the signed-in owner stands: approved, waiting, turned down, or not applied yet. */
export async function GET() {
  const owner = await currentOwner();
  if (!owner) return fail(401, "Sign in first.");
  return Response.json({ status: await access(owner), admin: isAdmin(owner) });
}

/** Sends the application. */
export async function POST(req: Request) {
  const owner = await currentOwner();
  if (!owner) return fail(401, "Sign in first.");
  const answers = checkAnswers(((await req.json().catch(() => null)) as { answers?: unknown } | null)?.answers);
  if (typeof answers === "string") return fail(400, answers);
  const a = await mutate(api.applications.submit, { owner, answers });
  return Response.json({ status: a.status });
}
