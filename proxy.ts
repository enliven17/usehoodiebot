import { NextResponse, type NextRequest } from "next/server";

/**
 * Writes to the API only from this site: a POST, PATCH or DELETE whose Origin is another site is refused before it
 * reaches a route. The session cookie is SameSite=Lax already; this closes what Lax leaves open (other subdomains,
 * older browsers). Requests without an Origin (server-to-server, the e2e script) carry no browser cookie to abuse.
 */
export function proxy(req: NextRequest) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return NextResponse.next();
  const origin = req.headers.get("origin");
  if (!origin) return NextResponse.next();
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let from = "";
  try {
    from = new URL(origin).host;
  } catch {
    /* a malformed Origin is a foreign one */
  }
  if (from && from === host) return NextResponse.next();
  return NextResponse.json({ error: "Requests must come from this site." }, { status: 403 });
}

export const config = { matcher: "/api/:path*" };
