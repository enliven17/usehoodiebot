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
import { GeckoClient } from "./gecko";
import { stockTokens } from "./stocks";

const GT = "https://api.geckoterminal.com/api/v2/networks/robinhood";
/** Phantom quote (1.68 ETH) plus the 4.2 ETH threshold: a curve's quote reserve when it graduates. */
const CURVE_FULL_ETH = 5.88;
const PHANTOM_ETH = 1.68;
const TTL_MS = 60_000;

/** curve and graduated are Pons; dex is any other token with a pool of its own, traded through 0x. */
export type Venue = "curve" | "graduated" | "dex";
export type Candidate = {
  token: `0x${string}`;
  symbol: string;
  /** The pool GeckoTerminal tracks it in: what the chart asks for candles. */
  pool?: string;
  /** What it is priced in, from the pool name ("X / WETH"): only ETH pairs can be traded here. */
  quote?: string;
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
    address?: string;
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

/**
 * A token's symbol as anyone may write it, cut to letters, digits and a few marks, 24 characters at most: it reaches the
 * model and the screen, and a launcher can put instructions in it.
 */
export const cleanSymbol = (s: string) => s.replace(/[^\p{L}\p{N} $._-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 24);

export function toCandidate(p: Pool, venue: Venue, now: number): Candidate | null {
  const a = p.attributes ?? {};
  const raw = p.relationships?.base_token?.data?.id?.replace(/^robinhood_/, "");
  if (!raw || !isAddress(raw, { strict: false })) return null;
  const created = a.pool_created_at ? Date.parse(a.pool_created_at) : NaN;
  const liquidityUsd = num(a.reserve_in_usd);
  const ethUsd = num(a.quote_token_price_usd);
  return {
    token: getAddress(raw),
    pool: a.address,
    quote: (a.name ?? "").split(" / ")[1]?.trim().split(" ")[0],
    symbol: cleanSymbol((a.name ?? "").split(" / ")[0] ?? "") || raw.slice(0, 6),
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

const gecko = new GeckoClient();
/** All agents share request pacing, cooldowns, in-flight reads and a bounded stale fallback. */
export const gt = <T>(url: string, ttl = TTL_MS, maxAge?: number): Promise<T> => gecko.get<T>(url, ttl, maxAge);
const pools = (url: string) => gt<{ data?: Pool[] }>(url).then((j) => j.data ?? []);

/** Not worth a strategy's entry: wrapped ETH and the dollar, which is what the other side of most pools is. */
const NOT_A_TRADE = new Set(["0x0bd7d308f8e1639fab988df18a8011f41eacad73", "0x5fc5360d0400a0fd4f2af552add042d716f1d168"]);
/** Names a copycat borrows to pass for the real thing: only the real addresses above may carry them. */
const BORROWED = new Set(["WETH", "ETH", "USDG", "USDC", "USDT", "WBTC", "BTC"]);
const venueOf = (dex: string | undefined): Venue => (dex === "pons-v2" ? "curve" : dex === "pons-v2-dex" ? "graduated" : "dex");

/**
 * Fresh launches and the busiest curve tokens, the busiest graduated ones, then the busiest pools on any other DEX:
 * established tokens, never a Stock Token (0x refuses them). Deduplicated by token.
 */
export async function candidatePage(page = 1): Promise<{ tokens: Candidate[]; incomplete: boolean; hasMore: boolean }> {
  const now = Date.now();
  const results = await Promise.allSettled([
    pools(`${GT}/new_pools?page=${page}`),
    pools(`${GT}/dexes/pons-v2/pools?page=${page}&sort=h24_volume_usd_desc`),
    pools(`${GT}/dexes/pons-v2-dex/pools?page=${page}&sort=h24_volume_usd_desc`),
    pools(`${GT}/pools?page=${page}&sort=h24_volume_usd_desc`),
  ]);
  if (results.every((r) => r.status === "rejected")) throw new Error("Market data is temporarily unavailable");
  const [newest = [], curve = [], graduated = [], busiest = []] = results.map((r) => r.status === "fulfilled" ? r.value : []);
  const fresh = newest.filter((p) => p.relationships?.dex?.data?.id === "pons-v2");
  const stocks = await stockTokens();
  const dex = busiest.filter((p) => venueOf(p.relationships?.dex?.data?.id) === "dex");
  const all = [
    ...[...fresh, ...curve].map((p) => toCandidate(p, "curve", now)),
    ...graduated.map((p) => toCandidate(p, "graduated", now)),
    ...dex.map((p) => toCandidate(p, "dex", now)),
  ].filter((c): c is Candidate => c !== null && !stocks.has(c.token.toLowerCase()) && !NOT_A_TRADE.has(c.token.toLowerCase()) && !(c.venue === "dex" && BORROWED.has(c.symbol.toUpperCase())));
  const seen = new Set<string>();
  return {
    tokens: all.filter((c) => !seen.has(c.token) && seen.add(c.token)),
    incomplete: results.some((r) => r.status === "rejected"),
    hasMore: page < 10 && [newest, curve, graduated, busiest].some((list) => list.length > 0),
  };
}

export async function candidates(): Promise<Candidate[]> {
  return (await candidatePage()).tokens;
}

/** Candle sizes the chart offers, as GeckoTerminal's timeframe and aggregate. */
export const TIMEFRAMES = { "1m": ["minute", 1, 60], "5m": ["minute", 5, 300], "15m": ["minute", 15, 900], "1h": ["hour", 1, 3600], "4h": ["hour", 4, 14_400], "1d": ["day", 1, 86_400] } as const;
export type Timeframe = keyof typeof TIMEFRAMES;
export type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };

/** A token's busiest pool (curve or graduated) with its market numbers. */
export async function tokenMarket(token: string): Promise<(Candidate & { pool: string }) | null> {
  // Graduation can change the pool at any moment; refresh alongside the market list.
  const list = (await gt<{ data?: Pool[] }>(`${GT}/tokens/${token.toLowerCase()}/pools?page=1`, 60_000)).data ?? [];
  const p = list.find((x) => x.relationships?.dex?.data?.id?.startsWith("pons-v2")) ?? list[0];
  const pool = p?.attributes?.address;
  if (!p || !pool) return null;
  const c = toCandidate(p, venueOf(p.relationships?.dex?.data?.id), Date.now());
  return c && { ...c, pool };
}

/** Candles in ETH (GeckoTerminal's price in the quote token), oldest first. Also runs in the browser (GT allows CORS). */
export async function candles(pool: string, tf: Timeframe): Promise<Candle[]> {
  const [unit, aggregate] = TIMEFRAMES[tf];
  const j = await gt<{ data?: { attributes?: { ohlcv_list?: number[][] } } }>(`${GT}/pools/${pool.toLowerCase()}/ohlcv/${unit}?aggregate=${aggregate}&limit=300&currency=token`, 30_000);
  return (j.data?.attributes?.ohlcv_list ?? [])
    .map(([time, open, high, low, close, volume]) => ({ time: time!, open: open!, high: high!, low: low!, close: close!, volume: volume ?? 0 }))
    .filter((c) => [c.time, c.open, c.high, c.low, c.close].every(Number.isFinite))
    .sort((a, b) => a.time - b.time)
    .filter((c, i, all) => i === 0 || c.time !== all[i - 1]!.time);
}

/** Tokens whose name or symbol matches `q`, Pons or any other DEX, busiest pool first, one row per token, no Stock Tokens. */
export async function searchTokens(q: string): Promise<Candidate[]> {
  const [list, stocks] = await Promise.all([pools(`${GT}/search/pools?query=${encodeURIComponent(q.slice(0, 40))}&network=robinhood`), stockTokens()]);
  const seen = new Set<string>();
  return list
    .map((p) => toCandidate(p, venueOf(p.relationships?.dex?.data?.id), Date.now()))
    .filter((c): c is Candidate => c !== null && (c.venue !== "graduated" || c.quote === "WETH" || c.quote === "ETH") && !stocks.has(c.token.toLowerCase()) && !seen.has(c.token) && !!seen.add(c.token));
}
