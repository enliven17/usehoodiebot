import "server-only";

import type { Id } from "@/convex/_generated/dataModel";
import { formatEther, getAddress, isAddress, type Address } from "viem";

import { randomUUID } from "node:crypto";

import { createExecutor, isAmbiguousSend, type Executor } from "../chain/executor";
import { robinhoodAgentPolicy } from "../chain/policy";
import { getPrivy } from "../chain/privy";
import { api, mutate, query } from "../db";
import { safeMessage } from "./errors";
import { fillEvent, logEvent } from "./events";

export type Team = { owner: Address; wallet: Address; walletId: string };
export type Approval = Awaited<ReturnType<typeof propose>>;

/** Approvals older than this are not traded: the market has moved. */
export const APPROVAL_TTL_MS = 15 * 60_000;
const LEASE_SECONDS = 150;

let executor: Executor | null = null;
export const getExecutor = () => (executor ??= createExecutor({ privy: getPrivy() }));

const strategyId = (id: string | null | undefined) => (id ?? undefined) as Id<"strategies"> | undefined;

export async function getTeam(owner: string): Promise<Team | null> {
  const t = await query(api.teams.get, { owner });
  return t ? { owner: t.owner as Address, wallet: t.wallet as Address, walletId: t.walletId } : null;
}

/** The team's own wallet, created once, under a policy that only lets it trade Pons and pay the owner. */
export async function ensureTeam(owner: Address): Promise<Team> {
  const existing = await getTeam(owner);
  if (existing) return existing;
  const w = await getPrivy().createWalletWithPolicy((address) => robinhoodAgentPolicy(address, owner, null));
  // ponytail: a lost race leaves one unused, unfunded wallet in Privy; harmless.
  const t = await mutate(api.teams.create, { owner, wallet: w.address, walletId: w.id, policyId: w.policyId });
  return { owner, wallet: t.wallet as Address, walletId: t.walletId };
}

/** Runs `fn` holding the team's wallet lease, or returns null when another transaction is in flight. */
async function withLease<T>(owner: string, fn: () => Promise<T>): Promise<T | null> {
  const token = randomUUID();
  if (!(await mutate(api.teams.lease, { owner, seconds: LEASE_SECONDS, token }))) return null;
  try {
    return await fn();
  } finally {
    await mutate(api.teams.release, { owner, token });
  }
}

/** A trade that was broadcast but not confirmed in time. It may still land: track it as "sent", never as failed. */
export class SentTrade extends Error {
  constructor(readonly hash: string) {
    super(`Sent but not confirmed yet: ${hash}. Check it on the explorer before trying again.`);
  }
}

/**
 * Buy `amount` wei of a token, or sell `amount` tokens of it (0 = all held; `positionId` = the position this sell
 * closes). Books the fill from the receipt. Throws SentTrade when the send is ambiguous.
 */
export async function trade(team: Team, a: { kind: "buy" | "sell"; token: string; symbol: string; amount: bigint; slippageBps: number; strategyId: string | null; positionId?: string }) {
  const ex = getExecutor();
  let hash: string | null = null;
  const base = { walletId: team.walletId, wallet: team.wallet, token: a.token, slippageBps: a.slippageBps, onSigned: async (h: string) => void (hash = h) };
  const sent = (err: unknown) => Promise.reject(isAmbiguousSend(err) && hash ? new SentTrade(hash) : err);
  if (a.kind === "buy") {
    const spendable = await ex.spendable(team.wallet);
    if (spendable < a.amount) throw new Error(`The wallet has ${formatEther(spendable)} ETH to trade; this needs ${formatEther(a.amount)}.`);
    const f = await ex.buy({ ...base, wei: a.amount }).catch(sent);
    await mutate(api.book.bought, { owner: team.owner, strategyId: strategyId(a.strategyId), token: a.token, symbol: a.symbol, tokens: f.tokens.toString(), wei: f.wei.toString(), hash: f.hash });
    return f;
  }
  const held = await ex.tokenBalance(team.wallet, a.token);
  const tokens = a.amount === 0n || held < a.amount ? held : a.amount;
  if (tokens === 0n) throw new Error(`The wallet holds no ${a.symbol}.`);
  const f = await ex.sell({ ...base, tokens }).catch(sent);
  await mutate(api.book.sold, { owner: team.owner, token: a.token, symbol: a.symbol, tokens: f.tokens.toString(), wei: f.wei.toString(), hash: f.hash, closes: tokens === held, positionId: a.positionId });
  return f;
}

export const propose = (owner: string, a: { kind: "buy" | "sell"; token: string; symbol: string; amount: bigint; reason: string; strategyId: string | null }) =>
  mutate(api.approvals.propose, { owner, strategyId: strategyId(a.strategyId), kind: a.kind, token: a.token, symbol: a.symbol, amount: a.amount.toString(), reason: a.reason });

/** The owner's yes or no. Claimed atomically in Convex, so a double click never trades twice. */
export async function decide(owner: string, id: string, yes: boolean, slippageBps = 300): Promise<Approval> {
  const claimed = await mutate(api.approvals.claim, { owner, id, approve: yes, ttlMs: APPROVAL_TTL_MS });
  if (!claimed) throw new Error("This approval is no longer open.");
  if (!yes) {
    await logEvent(owner, { member: "hoodiebot", kind: "skip", text: `You skipped the ${claimed.kind} of ${claimed.symbol}.`, token: claimed.token, symbol: claimed.symbol });
    return claimed;
  }
  const team = (await getTeam(owner))!;
  const outcome = await withLease(owner, async () => {
    try {
      const f = await trade(team, { kind: claimed.kind, token: claimed.token, symbol: claimed.symbol, amount: BigInt(claimed.amount), slippageBps, strategyId: claimed.strategyId });
      await logEvent(owner, fillEvent(claimed.kind, claimed.symbol, claimed.token, f, "after your approval"));
      return { status: "done" as const, result: { hash: f.hash, wei: f.wei.toString(), tokens: f.tokens.toString() } };
    } catch (err) {
      if (err instanceof SentTrade) return { status: "sent" as const, result: { hash: err.hash, error: err.message } };
      await logEvent(owner, { member: "trader", kind: "fail", text: `Could not ${claimed.kind} ${claimed.symbol}: ${safeMessage(err)}`, token: claimed.token, symbol: claimed.symbol });
      return { status: "failed" as const, result: { error: safeMessage(err) } };
    }
  });
  const final = outcome ?? { status: "failed" as const, result: { error: "Another trade is in flight. Try again in a minute." } };
  return mutate(api.approvals.finish, { id: claimed.id as Id<"approvals">, ...final });
}

/** Auto mode: trade now under the lease; null when the wallet is busy (the tick retries later). */
export const tradeNow = (team: Team, a: Parameters<typeof trade>[1]) => withLease(team.owner, () => trade(team, a));

/** Sends ETH back to the owner: the only destination the policy lets a plain transfer reach without a cap. */
export async function withdraw(team: Team, wei: bigint | "all"): Promise<string> {
  const ex = getExecutor();
  const spendable = await ex.spendable(team.wallet);
  const amount = wei === "all" ? spendable : wei;
  if (amount <= 0n || amount > spendable) throw new Error(`Up to ${formatEther(spendable)} ETH can be withdrawn.`);
  const hash = await withLease(team.owner, () => ex.transfer({ walletId: team.walletId, wallet: team.wallet, to: team.owner, wei: amount }));
  if (!hash) throw new Error("Another trade is in flight. Try again in a minute.");
  return hash;
}

export const normalizeToken = (t: unknown): Address | null => (typeof t === "string" && isAddress(t) ? getAddress(t) : null);
