import { signIn } from "@/lib/session";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { address?: unknown; signature?: unknown } | null;
  const owner = typeof body?.address === "string" && typeof body?.signature === "string" ? await signIn(body.address, body.signature) : null;
  return owner ? Response.json({ owner }) : Response.json({ error: "Signature did not match. Try again." }, { status: 401 });
}
