/** Robinhood Chain for the browser (wallet connect): the public RPC, never the server's keyed endpoint. */
import { defineChain } from "viem";

import { EXPLORER } from "./robinhood-urls";

export const robinhood = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_ROBINHOOD_RPC || "https://rpc.mainnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Blockscout", url: EXPLORER } },
});
