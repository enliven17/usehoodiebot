/**
 * Ready-made strategies, each tuned to one way Pons tokens move. The owner starts from one in the Team tab, or asks for
 * one by name in chat; either way it is an ordinary Strategy they can read and change.
 */
import type { Spec } from "./strategy";

export type Preset = { id: string; name: string; pitch: string; risk: "low" | "medium" | "high"; spec: Partial<Spec> & Pick<Spec, "watch" | "sizeEth"> };

export const PRESETS: readonly Preset[] = [
  {
    id: "launch-sniper",
    name: "Launch Sniper",
    pitch: "In the first ten minutes of a launch, only when buyers clearly outnumber sellers and ShieldBot is happy. Takes a double, trails the rest.",
    risk: "high",
    spec: { watch: "new", sizeEth: 0.01, maxOpen: 3, maxAgeMinutes: 10, maxCurvePct: 15, minLiquidityUsd: 3000, minBuySellRatio: 2, minSafetyScore: 70, takeProfitPct: 100, stopLossPct: 30, trailingStopPct: 25 },
  },
  {
    id: "momentum-rider",
    name: "Momentum Rider",
    pitch: "Tokens a fifth to two thirds up their curve with real volume and steady buying. Rides the move and steps out when it turns.",
    risk: "medium",
    spec: { watch: "curve", sizeEth: 0.01, maxOpen: 3, minCurvePct: 20, maxCurvePct: 70, minVolume1hUsd: 5000, minBuySellRatio: 1.8, minSafetyScore: 60, takeProfitPct: 60, stopLossPct: 25, trailingStopPct: 20 },
  },
  {
    id: "graduation-hunter",
    name: "Graduation Hunter",
    pitch: "Curves 75 to 95% full, close to the 4.2 ETH that moves them to Uniswap. Graduation tends to bring fresh buyers.",
    risk: "medium",
    spec: { watch: "curve", sizeEth: 0.015, maxOpen: 2, minCurvePct: 75, maxCurvePct: 95, minBuySellRatio: 1.3, minSafetyScore: 65, takeProfitPct: 50, stopLossPct: 20, trailingStopPct: 15 },
  },
  {
    id: "breakout",
    name: "Graduated Breakout",
    pitch: "Graduated tokens between $50k and $500k with heavy volume and more buys than sells. Tight stop, trails winners.",
    risk: "medium",
    spec: { watch: "graduated", sizeEth: 0.02, maxOpen: 2, minMcapUsd: 50_000, maxMcapUsd: 500_000, minVolume1hUsd: 10_000, minBuySellRatio: 1.5, minSafetyScore: 70, takeProfitPct: 40, stopLossPct: 15, trailingStopPct: 12 },
  },
  {
    id: "steady",
    name: "Slow and Steady",
    pitch: "Only established tokens with deep liquidity and a near-perfect ShieldBot score. Small size, small targets, quick to cut.",
    risk: "low",
    spec: { watch: "all", sizeEth: 0.005, maxOpen: 2, minMcapUsd: 100_000, minLiquidityUsd: 20_000, minSafetyScore: 85, takeProfitPct: 30, stopLossPct: 12, trailingStopPct: 10 },
  },
  {
    id: "lottery",
    name: "Lottery Tickets",
    pitch: "Tiny bets on launches under five minutes old and $15k. Most go to zero; the few that run pay for the rest.",
    risk: "high",
    spec: { watch: "new", sizeEth: 0.002, maxOpen: 5, maxAgeMinutes: 5, maxMcapUsd: 15_000, minSafetyScore: 50, takeProfitPct: 300, stopLossPct: 50 },
  },
];

export const presetById = (id: unknown) => PRESETS.find((p) => p.id === id) ?? null;
