import "server-only";

import { formatEther, getAddress, isAddress, type Address } from "viem";

import { createExecutor, type Executor } from "../chain/executor";
import { robinhoodAgentPolicy } from "../chain/policy";
import { getPrivy } from "../chain/privy";
import { sql } from "../db";

export type Team = { owner: Address; wallet: Address; wallet_id: string };
export type Approval = { id: string; owner: string; strategy_id: string | null; kind: "buy" | "sell"; token: string; symbol: string; amount: string; reason: string; status: string; result: unknown; created_at: string };
export type Position = { id: string; strategy_id: string | null; token: string; symbol: string; tokens: string; cost_wei: string; opened_at: string };

/** Approvals older than this are not traded: the market has moved. */
export const APPROVAL_TTL_MIN = 15;
const LEASE_SECONDS = 150;

let executor: Executor | null = null;
export const getExecutor = () => (executor ??= createExecutor({ privy: getPrivy() }));

export async function getTeam(owner: string): Promise<Team | null> {
  const [t] = await sql<Team>`select owner, wallet, wallet_id from teams where owner = ${owner}`;
  return t ?? null;
}

/** The team's own wallet, created once, under a policy that only lets it trade Pons and pay the owner. */
export async function ensureTeam(owner: Address): Promise<Team> {
  const existing = await getTeam(owner);
  if (existing) return existing;
  const w = await getPrivy().createWalletWithPolicy((address) => robinhoodAgentPolicy(address, owner, null));
  await sql`insert into teams (owner, wallet, wallet_id, policy_id) values (${owner}, ${w.address}, ${w.id}, ${w.policyId}) on conflict (owner) do nothing`;
  // ponytail: a lost race leaves one unused, unfunded wallet in Privy; harmless.
  return (await getTeam(owner))!;
}

/** Runs `fn` holding the team's wallet lease, or returns null when another transaction is in flight. */
async function withLease<T>(owner: string, fn: () => Promise<T>): Promise<T | null> {
  const [got] = await sql`update teams set busy_until = now() + make_interval(secs => ${LEASE_SECONDS}) where owner = ${owner} and (busy_until is null or busy_until < now()) returning owner`;
  if (!got) return null;
  try {
    return await fn();
  } finally {
    await sql`update teams set busy_until = null where owner = ${owner}`;
  }
}

/** Buy `wei` of a token, or sell the open position in it. Books the fill from the receipt. */
export async function trade(team: Team, a: { kind: "buy" | "sell"; token: string; symbol: string; amount: bigint; slippageBps: number; strategyId: string | null }) {
  const ex = getExecutor();
  const base = { walletId: team.wallet_id, wallet: team.wallet, token: a.token, slippageBps: a.slippageBps };
  if (a.kind === "buy") {
    const spendable = await ex.spendable(team.wallet);
    if (spendable < a.amount) throw new Error(`The wallet has ${formatEther(spendable)} ETH to trade; this needs ${formatEther(a.amount)}.`);
    const f = await ex.buy({ ...base, wei: a.amount });
    await sql`insert into positions (owner, strategy_id, token, symbol, tokens, cost_wei) values (${team.owner}, ${a.strategyId}, ${a.token}, ${a.symbol}, ${f.tokens.toString()}, ${f.wei.toString()})`;
    await sql`insert into trades (owner, side, token, symbol, wei, tokens, hash) values (${team.owner}, 'buy', ${a.token}, ${a.symbol}, ${f.wei.toString()}, ${f.tokens.toString()}, ${f.hash})`;
    return f;
  }
  const open = await sql<Position>`select id, tokens from positions where owner = ${team.owner} and token = ${a.token} and closed_at is null`;
  const held = await ex.tokenBalance(team.wallet, a.token);
  const tokens = held < a.amount || a.amount === 0n ? held : a.amount;
  if (tokens === 0n) throw new Error(`The wallet holds no ${a.symbol}.`);
  const f = await ex.sell({ ...base, tokens });
  await sql`insert into trades (owner, side, token, symbol, wei, tokens, hash) values (${team.owner}, 'sell', ${a.token}, ${a.symbol}, ${f.wei.toString()}, ${f.tokens.toString()}, ${f.hash})`;
  if (tokens === held) await sql`update positions set closed_at = now(), proceeds_wei = ${f.wei.toString()} where id = any(${open.map((p) => p.id)})`;
  return f;
}

export async function propose(owner: string, a: { kind: "buy" | "sell"; token: string; symbol: string; amount: bigint; reason: string; strategyId: string | null }): Promise<Approval> {
  const [row] = await sql<Approval>`insert into approvals (owner, strategy_id, kind, token, symbol, amount, reason) values (${owner}, ${a.strategyId}, ${a.kind}, ${a.token}, ${a.symbol}, ${a.amount.toString()}, ${a.reason}) returning *`;
  return row!;
}

/** The owner's yes or no. Claimed atomically, so a double click never trades twice. */
export async function decide(owner: string, id: string, yes: boolean, slippageBps = 300): Promise<Approval> {
  const [claimed] = await sql<Approval>`
    update approvals set status = ${yes ? "approved" : "skipped"}, decided_at = now()
    where id = ${id} and owner = ${owner} and status = 'pending' and created_at > now() - make_interval(mins => ${APPROVAL_TTL_MIN})
    returning *`;
  if (!claimed) throw new Error("This approval is no longer open.");
  if (!yes) return claimed;
  const team = (await getTeam(owner))!;
  const outcome = await withLease(owner, async () => {
    try {
      const f = await trade(team, { kind: claimed.kind, token: claimed.token, symbol: claimed.symbol, amount: BigInt(claimed.amount), slippageBps, strategyId: claimed.strategy_id });
      return { status: "done", result: { hash: f.hash, wei: f.wei.toString(), tokens: f.tokens.toString() } };
    } catch (err) {
      return { status: "failed", result: { error: err instanceof Error ? err.message.slice(0, 300) : String(err) } };
    }
  });
  const final = outcome ?? { status: "failed", result: { error: "Another trade is in flight. Try again in a minute." } };
  const [row] = await sql<Approval>`update approvals set status = ${final.status}, result = ${JSON.stringify(final.result)}::jsonb where id = ${id} returning *`;
  return row!;
}

/** Auto mode: trade now under the lease; returns null when the wallet is busy (the tick retries later). */
export const tradeNow = (team: Team, a: Parameters<typeof trade>[1]) => withLease(team.owner, () => trade(team, a));

/** Sends ETH back to the owner. The wallet's policy refuses any other destination anyway. */
export async function withdraw(team: Team, wei: bigint | "all"): Promise<string> {
  const ex = getExecutor();
  const spendable = await ex.spendable(team.wallet);
  const amount = wei === "all" ? spendable : wei;
  if (amount <= 0n || amount > spendable) throw new Error(`Up to ${formatEther(spendable)} ETH can be withdrawn.`);
  const hash = await withLease(team.owner, () => ex.transfer({ walletId: team.wallet_id, wallet: team.wallet, to: team.owner, wei: amount }));
  if (!hash) throw new Error("Another trade is in flight. Try again in a minute.");
  return hash;
}

export const normalizeToken = (t: unknown): Address | null => (typeof t === "string" && isAddress(t) ? getAddress(t) : null);
