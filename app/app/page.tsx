import type { Metadata } from "next";
import { Suspense } from "react";

import { App } from "@/components/app/App";
import { currentOwner } from "@/lib/session";

export const metadata: Metadata = { title: "App", openGraph: { images: [{ url: "/og/app.png", width: 1200, height: 630 }] } };
export const dynamic = "force-dynamic";

export default async function AppPage() {
  const owner = await currentOwner().catch(() => null);
  return (
    <Suspense>
      <App signedIn={!!owner} />
    </Suspense>
  );
}
