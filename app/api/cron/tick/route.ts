import { timingSafeEqual } from "node:crypto";

import { tick } from "@/lib/server/tick";

export const maxDuration = 60;

/** Vercel Cron calls this every minute with "Authorization: Bearer $CRON_SECRET". */
export async function GET(req: Request) {
  const want = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  const got = req.headers.get("authorization") ?? "";
  if (!process.env.CRON_SECRET || got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) {
    return new Response("unauthorized", { status: 401 });
  }
  return Response.json({ log: await tick() });
}
