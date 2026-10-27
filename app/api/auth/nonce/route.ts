import { newNonce } from "@/lib/session";

export async function GET() {
  return Response.json({ nonce: await newNonce() });
}
