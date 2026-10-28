import { clientIp, limited } from "@/lib/server/limit";
import { newNonce } from "@/lib/session";

export async function GET() {
  const slow = await limited(await clientIp(), "nonce");
  if (slow) return slow;
  return Response.json(await newNonce());
}
