/** HMAC-sealed values with an expiry, for the session and nonce cookies: "<value>.<expiresMs>.<hmac>". Pure. */
import { createHmac, timingSafeEqual } from "node:crypto";

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return s;
}
const mac = (v: string) => createHmac("sha256", secret()).update(v).digest("base64url");
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function seal(value: string, ttlMs: number, now = Date.now()) {
  const body = `${value}.${now + ttlMs}`;
  return `${body}.${mac(body)}`;
}
export function unseal(sealed: string | undefined, now = Date.now()): string | null {
  if (!sealed) return null;
  const i = sealed.lastIndexOf(".");
  const body = sealed.slice(0, i), sig = sealed.slice(i + 1);
  if (i < 0 || !same(sig, mac(body))) return null;
  const j = body.lastIndexOf(".");
  return Number(body.slice(j + 1)) > now ? body.slice(0, j) : null;
}
