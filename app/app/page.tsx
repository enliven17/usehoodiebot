import type { Metadata } from "next";
import { Suspense } from "react";

import { App } from "@/components/app/App";
import { currentOwner } from "@/lib/session";

export const metadata: Metadata = { title: "App" };
export const dynamic = "force-dynamic";

export default async function AppPage() {
  const owner = await currentOwner().catch(() => null);
  return (
    <Suspense>
      <App signedIn={!!owner} />
    </Suspense>
  );
}
