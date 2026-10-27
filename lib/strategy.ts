/** A Strategy: what to watch, what must pass, how much, and when to get out. Pure: parse, match, exit. */
import type { Candidate } from "./chain/market";

export type Spec = {
  watch: "new" | "curve" | "graduated" | "all";
  sizeEth: number;
  slippageBps: number;
  maxOpen: number;
  minMcapUsd?: number;
  maxMcapUsd?: number;
  minLiquidityUsd?: number;
  minVolume1hUsd?: number;
  minCurvePct?: number;
  maxCurvePct?: number;
  maxAgeMinutes?: number;
  /** buys / sells over the last hour */
  minBuySellRatio?: number;
  takeProfitPct?: number;
  stopLossPct?: number;
};

export const SPEC_LIMITS = { sizeEth: [0.0005, 1], slippageBps: [50, 1500], maxOpen: [1, 10], exitPct: [5, 1000] } as const;
const NEW_MINUTES = 120;

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const pos = (v: unknown) => { const n = num(v); return n !== undefined && n >= 0 ? n : undefined; };
const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v));
const exitPct = (v: unknown) => (pos(v) === undefined ? undefined : clamp(pos(v)!, SPEC_LIMITS.exitPct));

/** Anything the model or a client sends becomes a safe Spec: unknown fields dropped, sizes clamped. */
export function parseSpec(raw: unknown): Spec {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const watch = ["new", "curve", "graduated", "all"].includes(r.watch as string) ? (r.watch as Spec["watch"]) : "new";
  return {
    watch,
    sizeEth: clamp(num(r.sizeEth) ?? 0.01, SPEC_LIMITS.sizeEth),
    slippageBps: Math.round(clamp(num(r.slippageBps) ?? 300, SPEC_LIMITS.slippageBps)),
    maxOpen: Math.round(clamp(num(r.maxOpen) ?? 3, SPEC_LIMITS.maxOpen)),
    minMcapUsd: pos(r.minMcapUsd),
    maxMcapUsd: pos(r.maxMcapUsd),
    minLiquidityUsd: pos(r.minLiquidityUsd),
    minVolume1hUsd: pos(r.minVolume1hUsd),
    minCurvePct: pos(r.minCurvePct),
    maxCurvePct: pos(r.maxCurvePct),
    maxAgeMinutes: pos(r.maxAgeMinutes),
    minBuySellRatio: pos(r.minBuySellRatio),
    // At least 5% either way: a fresh position already reads about 2–3% down from the fees on the way in and out.
    takeProfitPct: exitPct(r.takeProfitPct),
    stopLossPct: exitPct(r.stopLossPct) !== undefined ? Math.min(99, exitPct(r.stopLossPct)!) : undefined,
  };
}

/** Null when the candidate passes, else the first rule it fails (shown to the user as the reason). */
export function rejects(s: Spec, c: Candidate): string | null {
  if (s.watch === "graduated" && c.venue !== "graduated") return "not graduated";
  if ((s.watch === "curve" || s.watch === "new") && c.venue !== "curve") return "not on the curve";
  if (s.watch === "new" && !(c.ageMinutes !== undefined && c.ageMinutes <= NEW_MINUTES)) return "not a new launch";
  const below = (v: number | undefined, min: number | undefined) => min !== undefined && !(v !== undefined && v >= min);
  const above = (v: number | undefined, max: number | undefined) => max !== undefined && !(v !== undefined && v <= max);
  if (below(c.mcapUsd, s.minMcapUsd) || above(c.mcapUsd, s.maxMcapUsd)) return "market cap";
  if (below(c.liquidityUsd, s.minLiquidityUsd)) return "liquidity";
  if (below(c.volume1hUsd, s.minVolume1hUsd)) return "volume";
  if (below(c.curvePct, s.minCurvePct) || above(c.curvePct, s.maxCurvePct)) return "curve progress";
  if (above(c.ageMinutes, s.maxAgeMinutes)) return "age";
  if (s.minBuySellRatio !== undefined) {
    const buys = c.buys1h ?? 0, sells = c.sells1h ?? 0;
    if (buys / Math.max(1, sells) < s.minBuySellRatio) return "buy pressure";
  }
  return null;
}

/** Whether an open position should be closed at `priceEth` (ETH per token now) against its entry. */
export function exitReason(s: Spec, entryEth: number, priceEth: number): "take profit" | "stop loss" | null {
  if (!(entryEth > 0) || !(priceEth > 0)) return null;
  const change = (priceEth / entryEth - 1) * 100;
  if (s.takeProfitPct !== undefined && change >= s.takeProfitPct) return "take profit";
  if (s.stopLossPct !== undefined && change <= -s.stopLossPct) return "stop loss";
  return null;
}

export type Tone = "up" | "down";
export type RuleRow = [label: string, value: string, tone?: Tone];

const usd = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(n % 1000 ? 1 : 0)}k` : `$${n}`);
const range = (min: number | undefined, max: number | undefined, f: (n: number) => string) =>
  min !== undefined && max !== undefined ? `${f(min)} to ${f(max)}` : max !== undefined ? `up to ${f(max)}` : `${f(min!)} or more`;
const minutes = (m: number) => (m >= 60 && m % 60 === 0 ? `${m / 60}h` : `${m}m`);

/** The rules as label and value, the way a person reads them back. Values stay ASCII: they are set in the mono face. */
export function ruleRows(s: Spec): RuleRow[] {
  const out: RuleRow[] = [["Size", `${s.sizeEth} ETH`], ["Slippage", `${s.slippageBps / 100}%`], ["Open at once", `up to ${s.maxOpen}`]];
  if (s.minMcapUsd !== undefined || s.maxMcapUsd !== undefined) out.push(["Market cap", range(s.minMcapUsd, s.maxMcapUsd, usd)]);
  if (s.minLiquidityUsd !== undefined) out.push(["Liquidity", `${usd(s.minLiquidityUsd)} or more`]);
  if (s.minVolume1hUsd !== undefined) out.push(["Volume, 1h", `${usd(s.minVolume1hUsd)} or more`]);
  if (s.minCurvePct !== undefined || s.maxCurvePct !== undefined) out.push(["Curve", range(s.minCurvePct, s.maxCurvePct, (n) => `${n}%`)]);
  if (s.maxAgeMinutes !== undefined) out.push(["Age", `under ${minutes(s.maxAgeMinutes)}`]);
  if (s.minBuySellRatio !== undefined) out.push(["Buys vs sells", `${s.minBuySellRatio}x or more`]);
  if (s.takeProfitPct !== undefined) out.push(["Take profit", `+${s.takeProfitPct}%`, "up"]);
  if (s.stopLossPct !== undefined) out.push(["Stop loss", `-${s.stopLossPct}%`, "down"]);
  return out;
}

/** One line per rule, for the model and for text. */
export const describe = (s: Spec): string[] => ruleRows(s).map(([k, v]) => `${k}: ${v}`);

export const WATCH_LABEL: Record<Spec["watch"], string> = { new: "New Pons launches", curve: "Tokens on the Pons curve", graduated: "Graduated Uniswap v4 pools", all: "All Pons tokens" };
