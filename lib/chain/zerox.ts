/**
 * 0x Swap API v2 (allowance-holder) on Robinhood Chain: routes ETH to and from any token with DEX liquidity, across
 * Uniswap, Ekubo, Pancake and the rest, multi-hop when that is cheaper. Needs ZEROX_API_KEY.
 * Verified 2026-10-31 against live responses: ETH→USDG via Uniswap v3, ETH→$WIF via UP_CL + Uniswap v4. 0x refuses
 * Robinhood Stock Tokens ("BUY_TOKEN_NOT_AUTHORIZED_FOR_TRADE", legal restrictions).
 *   GET https://api.0x.org/swap/allowance-holder/price?chainId&sellToken&buyToken&sellAmount   → {liquidityAvailable, buyAmount}
 *   GET https://api.0x.org/swap/allowance-holder/quote?...&taker&slippageBps                  → {..., minBuyAmount, transaction{to,data,value}}
 * Selling a token approves AllowanceHolder, the contract every quote's transaction goes to.
 */
import { getAddress, type Address, type Hex } from "viem";

export const ALLOWANCE_HOLDER: Address = "0x0000000000001fF3684f28c67538d4D072C22734";
export const ETH_PLACEHOLDER: Address = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const BASE = "https://api.0x.org/swap/allowance-holder";
const CHAIN = 4663;

export const zeroxReady = () => !!process.env.ZEROX_API_KEY?.trim();

type Price = { liquidityAvailable?: boolean; buyAmount?: string; name?: string; message?: string };
type Quote = Price & { minBuyAmount?: string; transaction?: { to: string; data: string; value: string } };

async function get<T extends Price>(path: "price" | "quote", q: Record<string, string>): Promise<T> {
  const key = process.env.ZEROX_API_KEY?.trim();
  if (!key) throw new Error("Swaps outside Pons need ZEROX_API_KEY");
  const r = await fetch(`${BASE}/${path}?${new URLSearchParams({ chainId: String(CHAIN), ...q })}`, {
    headers: { "0x-api-key": key, "0x-version": "v2" },
    signal: AbortSignal.timeout(10_000),
  });
  const j = (await r.json().catch(() => ({}))) as T;
  if (!r.ok) throw new Error(`0x ${r.status}: ${j.name ?? j.message ?? "error"}`);
  if (!j.liquidityAvailable || !j.buyAmount) throw new Error("No route for that swap right now");
  return j;
}

const side = (token: string, buy: boolean) => (buy ? { sellToken: ETH_PLACEHOLDER, buyToken: token } : { sellToken: token, buyToken: ETH_PLACEHOLDER });

/** What `amount` in gets out, fees included: tokens for wei on a buy, wei for tokens on a sell. */
export async function zeroxPrice(token: string, buy: boolean, amount: bigint): Promise<bigint> {
  return BigInt((await get<Price>("price", { ...side(token, buy), sellAmount: amount.toString() })).buyAmount!);
}

/** The most a buy-then-sell of the same size may lose, fees and price impact together, before a buy is refused. */
export const MAX_ROUND_TRIP_LOSS_BPS = 1000n;

/**
 * What share of `wei` comes back, in basis points, if the tokens it buys are sold straight back. The rug check for
 * tokens outside Pons: a pool whose listed liquidity is not really there, or a token with a sell tax, shows up here.
 * Verified 2026-10-31: a token GeckoTerminal listed with $9.6M liquidity returned 3.6% of a 0.01 ETH round trip.
 */
export async function roundTripBps(token: string, wei: bigint): Promise<bigint> {
  const tokens = await zeroxPrice(token, true, wei);
  return ((await zeroxPrice(token, false, tokens)) * 10_000n) / wei;
}

/**
 * A firm quote for `taker` with its transaction. Refused unless it goes to AllowanceHolder and, on a buy, carries
 * exactly the ETH asked for: a bad response can never send more, or somewhere else.
 */
export async function zeroxQuote(token: string, buy: boolean, amount: bigint, taker: string, slippageBps: number): Promise<{ to: Address; data: Hex; value: bigint; minOut: bigint }> {
  const q = await get<Quote>("quote", { ...side(token, buy), sellAmount: amount.toString(), taker, slippageBps: String(slippageBps) });
  const t = q.transaction;
  if (!t || getAddress(t.to) !== ALLOWANCE_HOLDER) throw new Error("0x quote did not go to AllowanceHolder");
  const value = BigInt(t.value || "0");
  if (value !== (buy ? amount : 0n)) throw new Error("0x quote carried the wrong ETH value");
  return { to: ALLOWANCE_HOLDER, data: t.data as Hex, value, minOut: BigInt(q.minBuyAmount ?? "0") };
}
