import "server-only";

import { parseEther } from "viem";

/** What Hoodie costs, paid in ETH on Robinhood Chain to FEE_WALLET. PLAN_MONTH_ETH and PLAN_YEAR_ETH override the prices. */
const price = (env: string | undefined, fallback: string) => (env && Number(env) > 0 ? env.trim() : fallback);
export const PLANS = {
  month: { name: "Monthly", days: 30, eth: price(process.env.PLAN_MONTH_ETH, "0.01") },
  year: { name: "Yearly", days: 365, eth: price(process.env.PLAN_YEAR_ETH, "0.1") },
} as const;
export type PlanId = keyof typeof PLANS;

export const isPlan = (p: unknown): p is PlanId => typeof p === "string" && Object.hasOwn(PLANS, p);
export const priceWei = (p: PlanId) => parseEther(PLANS[p].eth);
export const planList = () => Object.entries(PLANS).map(([id, p]) => ({ id, ...p }));
