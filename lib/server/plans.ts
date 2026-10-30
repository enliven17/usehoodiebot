import "server-only";

import { parseEther, parseUnits } from "viem";

/** World is Flat ($WIF) on Robinhood Chain, 18 decimals. Paying in it skips the waitlist and costs less than ETH. */
export const WIF = "0x5173b8eA6923c2d40267890D45C46a3480954773" as const;

/**
 * What Hoodie costs, paid on Robinhood Chain to FEE_WALLET, in ETH or $WIF.
 * PLAN_MONTH_ETH, PLAN_YEAR_ETH, PLAN_MONTH_WIF and PLAN_YEAR_WIF override the prices.
 */
const price = (env: string | undefined, fallback: string) => (env && Number(env) > 0 ? env.trim() : fallback);
export const PLANS = {
  month: { name: "Monthly", days: 30, eth: price(process.env.PLAN_MONTH_ETH, "0.01"), wif: price(process.env.PLAN_MONTH_WIF, "15000") },
  year: { name: "Yearly", days: 365, eth: price(process.env.PLAN_YEAR_ETH, "0.1"), wif: price(process.env.PLAN_YEAR_WIF, "150000") },
} as const;
export type PlanId = keyof typeof PLANS;
export type Coin = "eth" | "wif";

export const isPlan = (p: unknown): p is PlanId => typeof p === "string" && Object.hasOwn(PLANS, p);
export const isCoin = (c: unknown): c is Coin => c === "eth" || c === "wif";
/** The plan's price in the coin's smallest unit (wei for both: $WIF has 18 decimals too). */
export const priceWei = (p: PlanId, coin: Coin = "eth") => (coin === "wif" ? parseUnits(PLANS[p].wif, 18) : parseEther(PLANS[p].eth));
export const planList = () => Object.entries(PLANS).map(([id, p]) => ({ id, ...p }));
