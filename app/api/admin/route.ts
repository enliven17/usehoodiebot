import { api, query } from "@/lib/db";
import { isAdmin } from "@/lib/server/access";
import { fail } from "@/lib/server/http";
import { currentOwner } from "@/lib/session";

/** Everything the admin page shows: platform numbers, every team, the latest trades and decisions, and applications. */
export async function GET() {
  if (!isAdmin(await currentOwner())) return fail(404, "Not found.");
  const [overview, applications] = await Promise.all([query(api.admin.overview, {}), query(api.applications.list, {})]);
  return Response.json({ ...overview, applications });
}
