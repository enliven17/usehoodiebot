import { notFound } from "next/navigation";

import { Promo } from "@/components/promo/Promo";

/** The launch film, recorded by brand/promo.mjs. Development only. */
export default function PromoPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Promo />;
}
