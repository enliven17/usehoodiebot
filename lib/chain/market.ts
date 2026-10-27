/**
 * Pons tokens on Robinhood Chain from GeckoTerminal (free, no key, ~30 req/min; one cached call serves every agent).
 * Verified 2026-10-19 (mimir) against live responses:
 *   GET .../networks/robinhood/dexes/pons-v2/pools?sort=h24_volume_usd_desc       tokens still on their bonding curve
 *   GET .../networks/robinhood/dexes/pons-v2-dex/pools?sort=h24_volume_usd_desc   tokens graduated into Uniswap v4
 *   GET .../networks/robinhood/new_pools                                          every dex, newest first
 *   → data[].attributes {base_token_price_native_currency, quote_token_price_usd, reserve_in_usd, volume_usd.h1,
 *     fdv_usd, pool_created_at, transactions.h1}, relationships.base_token.data.id = "robinhood_<address>"
 * curvePct is real ETH raised over the 4.2 ETH graduation threshold, from reserve_in_usd and the ETH price GT reports.
 */
import { getAddress, isAddress } from "viem";

const GT = "https://api.geckoterminal.com/api/v2/networks/robinhood";
/** Phantom quote (1.68 ETH) plus the 4.2 ETH threshold: a curve's quote reserve when it graduates. */
const CURVE_FULL_ETH = 5.88;
const PHANTOM_ETH = 1.68;
const TTL_MS = 60_000;

export type Venue = "curve" | "graduated";
export type Candidate = {
  token: `0x${string}`;
  symbol: string;
  venue: Venue;
  priceEth: number | null;
  liquidityUsd?: number;
  volume1hUsd?: number;
  mcapUsd?: number;
  ageMinutes?: number;
  curvePct?: number;
  buys1h?: number;
  sells1h?: number;
};

type Pool = {
  attributes?: {
    name?: string;
    base_token_price_native_currency?: string;
    quote_token_price_usd?: string;
    reserve_in_usd?: string;
    fdv_usd?: string;
    pool_created_at?: string;
    volume_usd?: { h1?: string };
    transactions?: { h1?: { buys?: number; sells?: number } };
  };
  relationships?: { base_token?: { data?: { id?: string } }; dex?: { data?: { id?: string } } };
};

const num = (v: unknown) => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
};

export function toCandidate(p: Pool, venue: Venue, now: number): Candidate | null {
  const a = p.attributes ?? {};
  const raw = p.relationships?.base_token?.data?.id?.replace(/^robinhood_/, "");
  if (!raw || !isAddress(raw, { strict: false })) return null;
  const created = a.pool_created_at ? Date.parse(a.pool_created_at) : NaN;
  const liquidityUsd = num(a.reserve_in_usd);
  const ethUsd = num(a.quote_token_price_usd);
  return {
    token: getAddress(raw),
    symbol: (a.name ?? "").split(" / ")[0]?.trim() || raw.slice(0, 6),
    venue,
    priceEth: num(a.base_token_price_native_currency) ?? null,
    liquidityUsd,
    volume1hUsd: num(a.volume_usd?.h1),
    mcapUsd: num(a.fdv_usd),
    ageMinutes: Number.isFinite(created) ? Math.max(0, (now - created) / 60_000) : undefined,
    // GT counts the curve's quote reserve with its phantom part; strip it to get the ETH really raised.
    curvePct:
      venue === "curve" && liquidityUsd !== undefined && ethUsd
        ? Math.min(100, Math.max(0, ((liquidityUsd / ethUsd - PHANTOM_ETH) / (CURVE_FULL_ETH - PHANTOM_ETH)) * 100))
        : undefined,
    buys1h: a.transactions?.h1?.buys,
    sells1h: a.transactions?.h1?.sells,
  };
}

// ponytail: per-instance memory cache; a shared cache (KV) only if serverless cold starts start hitting the rate limit.
const cache = new Map<string, { at: number; data: Promise<Pool[]> }>();
function pools(url: string): Promise<Pool[]> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  const data = fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15_000) }).then(async (r) => {
    if (!r.ok) throw new Error(`geckoterminal ${r.status}`);
    return ((await r.json()) as { data?: Pool[] }).data ?? [];
  });
  data.catch(() => cache.delete(url));
  cache.set(url, { at: Date.now(), data });
  return data;
}

/** Fresh launches and the busiest curve tokens, then the busiest graduated ones. Deduplicated by token. */
export async function candidates(): Promise<Candidate[]> {
  const now = Date.now();
  const [newest, curve, graduated] = await Promise.all([
    pools(`${GT}/new_pools?page=1`).catch(() => [] as Pool[]),
    pools(`${GT}/dexes/pons-v2/pools?page=1&sort=h24_volume_usd_desc`).catch(() => [] as Pool[]),
    pools(`${GT}/dexes/pons-v2-dex/pools?page=1&sort=h24_volume_usd_desc`).catch(() => [] as Pool[]),
  ]);
  const fresh = newest.filter((p) => p.relationships?.dex?.data?.id === "pons-v2");
  const all = [
    ...[...fresh, ...curve].map((p) => toCandidate(p, "curve", now)),
    ...graduated.map((p) => toCandidate(p, "graduated", now)),
  ].filter((c): c is Candidate => c !== null);
  const seen = new Set<string>();
  return all.filter((c) => !seen.has(c.token) && seen.add(c.token));
}
