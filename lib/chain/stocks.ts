/**
 * Robinhood Stock Tokens on Robinhood Chain, from Robinhood's own list (public, read-only, no key):
 *   GET https://api.robinhood.com/rhj/assets → {assets: [{tokenSymbol, tokenName, status, deployments: [{contractAddress, chainId}]}]}
 * Verified 2026-10-31: 203 active assets on chain 4663. Used to keep them apart from ordinary tokens: 0x refuses them.
 */
import { getAddress, isAddress } from "viem";

const URL = "https://api.robinhood.com/rhj/assets";
const TTL_MS = 6 * 3600_000;
let cache: { at: number; set: Set<string> } | null = null;

/** Lower-cased addresses of every Stock Token on Robinhood Chain. An empty set when the list cannot be read. */
export async function stockTokens(): Promise<Set<string>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.set;
  try {
    const r = await fetch(URL, { signal: AbortSignal.timeout(8_000) });
    const j = (await r.json()) as { assets?: Array<{ deployments?: Array<{ contractAddress?: string; chainId?: number }> }> };
    const set = new Set<string>();
    for (const a of j.assets ?? []) for (const d of a.deployments ?? []) if (d.chainId === 4663 && d.contractAddress && isAddress(d.contractAddress)) set.add(getAddress(d.contractAddress).toLowerCase());
    if (set.size) cache = { at: Date.now(), set };
    return set;
  } catch {
    return cache?.set ?? new Set();
  }
}
