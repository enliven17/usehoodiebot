/**
 * Robinhood Chain: Robinhood's Arbitrum Orbit L2 (EVM, gas in ETH). Mainnet chain id 4663.
 * The public RPC is rate limited; set ROBINHOOD_RPC to a provider endpoint for real traffic.
 */
import { createPublicClient, defineChain, http, type PublicClient } from "viem";

export const ROBINHOOD_CHAIN = {
  id: 4663,
  name: "Robinhood Chain",
  rpcUrl: (process.env.ROBINHOOD_RPC || process.env.NEXT_PUBLIC_ROBINHOOD_RPC || "https://rpc.mainnet.chain.robinhood.com").trim(),
  explorer: "https://robinhoodchain.blockscout.com",
} as const;

export const robinhood = defineChain({
  id: ROBINHOOD_CHAIN.id,
  name: ROBINHOOD_CHAIN.name,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [ROBINHOOD_CHAIN.rpcUrl] } },
  blockExplorers: { default: { name: "Blockscout", url: ROBINHOOD_CHAIN.explorer } },
});

let client: PublicClient | null = null;
export const publicClient = () => (client ??= createPublicClient({ chain: robinhood, transport: http(ROBINHOOD_CHAIN.rpcUrl, { timeout: 20_000, retryCount: 2 }) }) as PublicClient);

export const txUrl = (hash: string) => `${ROBINHOOD_CHAIN.explorer}/tx/${hash}`;
export const addressUrl = (a: string) => `${ROBINHOOD_CHAIN.explorer}/address/${a}`;
