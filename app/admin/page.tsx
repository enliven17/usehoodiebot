import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Admin } from "@/components/admin/Admin";
import { isAdmin } from "@/lib/server/access";
import { currentOwner } from "@/lib/session";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Only the admin wallet (signed in through /app) sees this page; everyone else gets a plain 404. */
export default async function AdminPage() {
  if (!isAdmin(await currentOwner().catch(() => null))) notFound();
  return <Admin />;
}
