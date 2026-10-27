/**
 * Sign-in: the owner signs a one-time message with their wallet (EIP-191), we set an HMAC-signed cookie.
 * Cookie value: "<address>.<expiresMs>.<hmac>". The nonce lives in its own short cookie, signed the same way.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getAddress, isAddress, verifyMessage, type Address } from "viem";

import { signInMessage } from "./sign-in-message";

const SESSION = "hb_session";
const NONCE = "hb_nonce";
const SESSION_MS = 30 * 24 * 3600_000;
const NONCE_MS = 10 * 60_000;

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


const cookieOpts = (maxAge: number) => ({ httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: Math.floor(maxAge / 1000) });

export async function newNonce(): Promise<string> {
  const nonce = randomBytes(16).toString("hex");
  (await cookies()).set(NONCE, seal(nonce, NONCE_MS), cookieOpts(NONCE_MS));
  return nonce;
}

export async function signIn(address: string, signature: string): Promise<Address | null> {
  const jar = await cookies();
  const nonce = unseal(jar.get(NONCE)?.value);
  jar.delete(NONCE);
  if (!nonce || !isAddress(address) || !/^0x[0-9a-fA-F]{130}$/.test(signature)) return null;
  const owner = getAddress(address);
  const ok = await verifyMessage({ address: owner, message: signInMessage(owner, nonce), signature: signature as `0x${string}` }).catch(() => false);
  if (!ok) return null;
  jar.set(SESSION, seal(owner, SESSION_MS), cookieOpts(SESSION_MS));
  return owner;
}

export async function signOut() {
  (await cookies()).delete(SESSION);
}

export async function currentOwner(): Promise<Address | null> {
  const v = unseal((await cookies()).get(SESSION)?.value);
  return v && isAddress(v) ? getAddress(v) : null;
}
