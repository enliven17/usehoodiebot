/**
 * Sign-in: the owner signs a one-time message with their wallet (EIP-191), we set an HMAC-signed cookie.
 * Cookie value: "<address>.<expiresMs>.<hmac>". The nonce lives in its own short cookie, signed the same way.
 */
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getAddress, isAddress, verifyMessage, type Address } from "viem";

import { api, mutate, query } from "./db";
import { seal, unseal } from "./seal";
import { SIGN_IN_TTL_MS, signInMessage } from "./sign-in-message";

const isAdminAddress = (a: string) => (process.env.ADMIN_ADDRESSES ?? "0xcc78505FE8707a1D85229BA0E7177aE26cE0f17D").toLowerCase().split(",").map((x) => x.trim()).includes(a.toLowerCase());

const SESSION = "hb_session";
const NONCE = "hb_nonce";
const SESSION_MS = 30 * 24 * 3600_000;
/** The admin wallet's sessions last a day: it can approve people and rewrite every wallet's policy. */
const ADMIN_SESSION_MS = 24 * 3600_000;
const NONCE_MS = 10 * 60_000;



const cookieOpts = (maxAge: number) => ({ httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: Math.floor(maxAge / 1000) });

/** A fresh nonce and the moment it was issued, both sealed in a short cookie the signature is checked against. */
export async function newNonce(): Promise<{ nonce: string; issuedAt: string }> {
  const nonce = randomBytes(16).toString("hex");
  const issuedAt = new Date().toISOString();
  (await cookies()).set(NONCE, seal(`${nonce}|${issuedAt}`, NONCE_MS), cookieOpts(NONCE_MS));
  return { nonce, issuedAt };
}

/**
 * Checks the signed sign-in message, rebuilt from this request's host, the sealed nonce and its issue time. `useOnce`
 * claims the nonce so a captured cookie and signature cannot be replayed; it returns false when it was already used.
 */
export async function signIn(address: string, signature: string, site: { domain: string; uri: string }, useOnce: (nonce: string) => Promise<boolean>): Promise<Address | null> {
  const jar = await cookies();
  const sealed = unseal(jar.get(NONCE)?.value);
  jar.delete(NONCE);
  const [nonce, issuedAt] = sealed?.split("|") ?? [];
  if (!nonce || !issuedAt || !isAddress(address) || !/^0x[0-9a-fA-F]{130}$/.test(signature)) return null;
  if (Date.now() > Date.parse(issuedAt) + SIGN_IN_TTL_MS) return null;
  const owner = getAddress(address);
  const message = signInMessage({ ...site, address: owner, nonce, issuedAt });
  const ok = await verifyMessage({ address: owner, message, signature: signature as `0x${string}` }).catch(() => false);
  if (!ok || !(await useOnce(nonce))) return null;
  const ttl = isAdminAddress(owner) ? ADMIN_SESSION_MS : SESSION_MS;
  // the cookie carries when it was issued, so signing out everywhere can refuse every earlier one
  jar.set(SESSION, seal(`${owner}|${Date.now()}`, ttl), cookieOpts(ttl));
  return owner;
}

/** Ends this session and every other one for the owner: a cookie copied elsewhere stops working too. */
export async function signOut() {
  const owner = await currentOwner();
  (await cookies()).delete(SESSION);
  if (owner) {
    revoked.delete(owner);
    await mutate(api.sessions.revoke, { owner }).catch(() => {});
  }
}

// ponytail: per-instance cache of 30 s, so a sign-out everywhere reaches every server within half a minute
const revoked = new Map<string, { at: number; before: number }>();
async function revokedBefore(owner: string) {
  const hit = revoked.get(owner);
  if (hit && Date.now() - hit.at < 30_000) return hit.before;
  const before = await query(api.sessions.revokedBefore, { owner }).catch(() => 0);
  revoked.set(owner, { at: Date.now(), before });
  return before;
}

export async function currentOwner(): Promise<Address | null> {
  const v = unseal((await cookies()).get(SESSION)?.value);
  const [addr, issued] = v?.split("|") ?? [];
  if (!addr || !isAddress(addr)) return null;
  const owner = getAddress(addr);
  return Number(issued ?? 0) >= (await revokedBefore(owner)) ? owner : null;
}
