import type { Id } from "@/convex/_generated/dataModel";
import { api, mutate } from "@/lib/db";
import { isAdmin } from "@/lib/server/access";
import { fail } from "@/lib/server/http";
import { currentOwner } from "@/lib/session";

/** The admin's call on one application: approved, rejected, or back to pending. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const owner = await currentOwner();
  if (!owner || !isAdmin(owner)) return fail(404, "Not found.");
  const { id } = await params;
  const status = ((await req.json().catch(() => null)) as { status?: unknown } | null)?.status;
  if (!/^[a-z0-9]{8,64}$/.test(id) || (status !== "approved" && status !== "rejected" && status !== "pending")) return fail(400, "Bad request.");
  const row = await mutate(api.applications.decide, { id: id as Id<"applications">, status, by: owner });
  return row ? Response.json(row) : fail(404, "No such application.");
}
