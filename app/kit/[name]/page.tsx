import { notFound } from "next/navigation";

import { KITS, KitAsset } from "@/components/kit/Kit";

/** Brand asset sources, rendered to PNG by brand/render.mjs. Development only. */
export default async function KitPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (process.env.NODE_ENV === "production" || !(name in KITS)) notFound();
  return <KitAsset name={name as keyof typeof KITS} />;
}
