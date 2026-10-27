// Privy server wallets over REST, EVM only (Robinhood Chain). Secrets never appear in errors or logs.
//
// Docs (ported from mimir, verified 2026-10-05):
//   https://docs.privy.io/api-reference/introduction.md       Basic auth (appId:appSecret) + privy-app-id header
//   https://docs.privy.io/api-reference/wallets/create.md     POST /v1/wallets {chain_type, policy_ids (max 1), owner}
//   https://docs.privy.io/api-reference/wallets/update.md     PATCH /v1/wallets/{id} {policy_ids}
//   https://docs.privy.io/api-reference/policies/create.md    POST /v1/policies {version, name, chain_type, rules, owner}
//   https://docs.privy.io/api-reference/wallets/ethereum/eth-sign-transaction.md
//       POST /v1/wallets/{id}/rpc {method:"eth_signTransaction", params:{transaction}} -> data.signed_transaction
//   https://docs.privy.io/api-reference/idempotency-keys.md   on /rpc a 5xx is cached for the key, so every call gets a fresh key
//   https://docs.privy.io/controls/authorization-keys/using-owners/sign/direct-implementation.md
//       privy-authorization-signature = base64(DER ECDSA P-256/SHA-256 over RFC 8785 JSON of
//       {version:1, method, url, body, headers:{privy-* headers}}); key is "wallet-auth:" + base64 PKCS#8.
//       The authorization key owns every wallet and policy we create, so the app secret alone cannot sign or
//       change policies. node:crypto on purpose: it produces DER, WebCrypto would produce raw r||s.
import { createPrivateKey, createPublicKey, randomUUID, sign as cryptoSign, type KeyObject } from "node:crypto";
import { isAddress, type Address, type Hex } from "viem";

import type { EvmPolicyInput } from "./policy";

/** An EIP-1559 transaction as Privy takes it: quantities as hex strings. */
export type EvmTx = { to: string; value: string; data: string; chain_id: number; nonce: number; gas_limit: string; max_fee_per_gas: string; max_priority_fee_per_gas: string; type: 2 };
type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

const BASE_URL = "https://api.privy.io";
const TIMEOUT_MS = 20_000;
const REQUEST_TTL_MS = 60_000;

/** RFC 8785 for the JSON we send (strings, booleans, safe integers, arrays, objects). */
export function canonicalize(v: Json): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalize).join(",")}]`;
  const keys = Object.keys(v).filter((k) => v[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(v[k])}`).join(",")}}`;
}

function parseAuthKey(authKey: string): { privateKey: KeyObject; publicKeyB64: string } {
  try {
    const privateKey = createPrivateKey({ key: Buffer.from(authKey.replace(/^wallet-auth:/, ""), "base64"), format: "der", type: "pkcs8" });
    if (privateKey.asymmetricKeyType !== "ec") throw new Error("not an EC key");
    return { privateKey, publicKeyB64: createPublicKey(privateKey).export({ type: "spki", format: "der" }).toString("base64") };
  } catch {
    throw new Error("PRIVY_AUTHORIZATION_KEY is not a valid P-256 PKCS#8 key");
  }
}

const scrub = (text: string, secrets: Array<string | undefined>) => secrets.reduce<string>((t, s) => (s ? t.split(s).join("[redacted]") : t), text).slice(0, 300);

export function createPrivy(o: { appId: string; appSecret: string; authKey?: string }) {
  if (!o.appId || !o.appSecret) throw new Error("PRIVY_APP_ID and PRIVY_APP_SECRET are required");
  const auth = o.authKey ? parseAuthKey(o.authKey) : null;
  const basic = `Basic ${Buffer.from(`${o.appId}:${o.appSecret}`).toString("base64")}`;
  const owner: Record<string, Json> = auth ? { owner: { public_key: auth.publicKeyB64 } } : {};

  async function call(method: "POST" | "PATCH", path: string, body: Json): Promise<Record<string, unknown>> {
    const url = `${BASE_URL}${path}`;
    const privy = { "privy-app-id": o.appId, "privy-idempotency-key": randomUUID(), "privy-request-expiry": String(Date.now() + REQUEST_TTL_MS) };
    const headers: Record<string, string> = { ...privy, authorization: basic, "content-type": "application/json" };
    if (auth) {
      const payload = canonicalize({ version: 1, method, url, body, headers: privy });
      headers["privy-authorization-signature"] = cryptoSign("sha256", Buffer.from(payload), auth.privateKey).toString("base64");
    }
    const res = await fetch(url, { method, headers, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`privy ${method} ${path} -> ${res.status}: ${scrub(await res.text().catch(() => ""), [o.appSecret, o.authKey])}`);
    return (await res.json()) as Record<string, unknown>;
  }

  const checkWalletId = (id: string) => {
    if (!/^[a-z0-9]{10,64}$/.test(id)) throw new Error("walletId is malformed");
  };

  return {
    /** Signs an EVM transaction under the wallet's policy; the caller broadcasts it. Returns the RLP-encoded signed tx. */
    async signEvmTransaction(walletId: string, transaction: EvmTx): Promise<Hex> {
      checkWalletId(walletId);
      const out = await call("POST", `/v1/wallets/${walletId}/rpc`, { method: "eth_signTransaction", params: { transaction } });
      const signed = (out.data as { signed_transaction?: unknown } | undefined)?.signed_transaction;
      if (typeof signed !== "string" || !/^0x[0-9a-fA-F]+$/.test(signed)) throw new Error("eth_signTransaction returned no signed_transaction");
      return signed as Hex;
    },

    /** A new policy attached to an existing wallet in place of its old one. Returns the new policy id. */
    async replacePolicy(walletId: string, policy: EvmPolicyInput): Promise<string> {
      checkWalletId(walletId);
      const p = await call("POST", "/v1/policies", { ...(policy as unknown as Record<string, Json>), ...owner });
      if (typeof p.id !== "string") throw new Error("privy returned a malformed policy");
      await call("PATCH", `/v1/wallets/${walletId}`, { policy_ids: [p.id] });
      return p.id;
    },

    /** Wallet, then its policy (built from the address), then attach. A wallet whose policy failed must never be funded. */
    async createWalletWithPolicy(buildPolicy: (address: Address) => EvmPolicyInput): Promise<{ id: string; address: Address; policyId: string }> {
      const w = await call("POST", "/v1/wallets", { chain_type: "ethereum", ...owner });
      if (typeof w.id !== "string" || typeof w.address !== "string" || !isAddress(w.address)) throw new Error("privy returned a malformed wallet");
      const wallet = { id: w.id, address: w.address as Address };
      try {
        const p = await call("POST", "/v1/policies", { ...(buildPolicy(wallet.address) as unknown as Record<string, Json>), ...owner });
        if (typeof p.id !== "string") throw new Error("privy returned a malformed policy");
        await call("PATCH", `/v1/wallets/${wallet.id}`, { policy_ids: [p.id] });
        return { ...wallet, policyId: p.id };
      } catch (err) {
        throw new Error(`wallet ${wallet.id} created but policy not attached; do NOT fund it: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  };
}

export type Privy = ReturnType<typeof createPrivy>;

let cached: Privy | null = null;
export function getPrivy(env: Record<string, string | undefined> = process.env): Privy {
  if (cached) return cached;
  if (!env.PRIVY_AUTHORIZATION_KEY && env.NODE_ENV === "production") throw new Error("PRIVY_AUTHORIZATION_KEY is required in production");
  return (cached = createPrivy({ appId: env.PRIVY_APP_ID ?? "", appSecret: env.PRIVY_APP_SECRET ?? "", authKey: env.PRIVY_AUTHORIZATION_KEY || undefined }));
}
