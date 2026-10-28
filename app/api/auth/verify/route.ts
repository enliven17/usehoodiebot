import { headers } from "next/headers";

import { api, mutate } from "@/lib/db";
import { SIGN_IN_TTL_MS } from "@/lib/sign-in-message";
import { clientIp, limited } from "@/lib/server/limit";
import { signIn } from "@/lib/session";

/** The signature from the sign-in message, checked against this site's own host and a nonce that works once. */
export async function POST(req: Request) {
  const slow = await limited(await clientIp(), "verify");
  if (slow) return slow;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const body = (await req.json().catch(() => null)) as { address?: unknown; signature?: unknown } | null;
  // a nonce is spent the first time it verifies: the limiter's window holds it as long as a nonce lives
  const useOnce = (nonce: string) => mutate(api.limits.hit, { key: `nonce-used:${nonce}`, limit: 1, windowMs: SIGN_IN_TTL_MS }).then((r) => r.ok).catch(() => false);
  const owner = typeof body?.address === "string" && typeof body?.signature === "string" ? await signIn(body.address, body.signature, { domain: host, uri: `${proto}://${host}` }, useOnce) : null;
  return owner ? Response.json({ owner }) : Response.json({ error: "Signature did not match. Try again." }, { status: 401 });
}
