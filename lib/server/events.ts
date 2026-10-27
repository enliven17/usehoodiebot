import "server-only";

import { formatEther } from "viem";

import { api, mutate } from "../db";
import type { Member } from "../team";

export type TeamEvent = { member: Member; kind: string; text: string; token?: string; symbol?: string; hash?: string; wei?: bigint };

/** Records a decision for the app's timeline. Never throws: a lost log line must not stop a trade. */
export async function logEvent(owner: string, e: TeamEvent) {
  try {
    await mutate(api.events.log, { owner, member: e.member, kind: e.kind, text: e.text, token: e.token, symbol: e.symbol, hash: e.hash, wei: e.wei?.toString() });
  } catch (err) {
    console.error("event log failed", err instanceof Error ? err.message.slice(0, 120) : err);
  }
}

export const eth = (wei: bigint) => `${Number(formatEther(wei < 0n ? -wei : wei)).toFixed(4).replace(/\.?0+$/, "")} ETH`;

/** The timeline line for a fill: tokens and ETH as read from the receipt. */
export function fillEvent(kind: "buy" | "sell", symbol: string, token: string, f: { hash: string; wei: bigint; tokens: bigint }, how: string) {
  const amount = Number(f.tokens / 10n ** 12n) / 1e6; // whole tokens, 6 decimals are plenty for a timeline
  const qty = amount >= 1e6 ? `${(amount / 1e6).toFixed(2)}M` : amount >= 1e3 ? `${(amount / 1e3).toFixed(1)}k` : amount.toFixed(2);
  return kind === "buy"
    ? { member: "trader" as const, kind: "buy", text: `Bought ${qty} ${symbol} for ${eth(f.wei)} ${how}.`, token, symbol, hash: f.hash, wei: -f.wei }
    : { member: "trader" as const, kind: "sell", text: `Sold ${qty} ${symbol} for ${eth(f.wei)} ${how}.`, token, symbol, hash: f.hash, wei: f.wei };
}
