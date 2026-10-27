/**
 * Executor for a HOODIEBOT agent: trades from its Privy server wallet on Robinhood Chain.
 * Routing: the token's Pons bonding curve while it trades, the Uniswap v4 pool once it has graduated. Only Pons
 * tokens (ETH-quoted) are traded. Fills are read from the receipt (curve events, token Transfer logs), never from a
 * quote.
 *
 * Units: ETH amounts are wei, token amounts raw units (18 decimals).
 *
 * Each transaction: nonce (pending), gas estimate +20%, EIP-1559 fees from the node, signed by Privy
 * (eth_signTransaction, under the wallet's policy), broadcast here, and awaited; a revert throws.
 */
import {
  decodeEventLog,
  encodeFunctionData,
  maxUint160,
  maxUint256,
  parseAbi,
  toHex,
  zeroHash,
  type Address,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
} from "viem";

import { publicClient, ROBINHOOD_CHAIN } from "./robinhood";
import type { EvmTx, Privy } from "./privy";
import {
  CURVE_ABI,
  ERC20_ABI,
  ESCROW_ABI,
  FACTORY_ABI,
  minOut,
  NATIVE,
  Phase,
  PONS_DECIMALS,
  PONS_FACTORY,
  PONS_FEE_ESCROW,
  quoteCurveBuy,
  quoteCurveSell,
} from "./pons";
import { PERMIT2, PERMIT2_ABI, ponsPool, QUOTER_ABI, ROUTER_ABI, UNIVERSAL_ROUTER, V4_QUOTER, v4SwapCall, type PoolKey } from "./v4";

/** Kept in the wallet for gas: Robinhood Chain gas is cheap, a few hundred transactions' worth. */
export const RESERVE_WEI = 300_000_000_000_000n; // 0.0003 ETH
const TRANSFER_ABI = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)"]);
const MAX_UINT48 = 2n ** 48n - 1n;

export type TradeArgs = { walletId: string; wallet: string; token: string; slippageBps: number; onSigned?: (hash: string) => Promise<void> };
export type Fill = { hash: string; wei: bigint; tokens: bigint };

export type ExecutorDeps = { privy: Pick<Privy, "signEvmTransaction">; client?: PublicClient; reserveWei?: bigint };

type Market = { kind: "curve"; curve: Address; reserves: { quote: bigint; tokens: bigint; feeBps: bigint; taxBps: bigint } } | { kind: "pool"; pool: PoolKey };

export function createExecutor(d: ExecutorDeps) {
  const client = d.client ?? publicClient();
  const reserve = d.reserveWei ?? RESERVE_WEI;
  const addr = (a: string) => a as Address;

  async function send(walletId: string, wallet: string, call: { to: Address; data: Hex; value?: bigint }, onSigned?: (hash: string) => Promise<void>): Promise<TransactionReceipt> {
    const from = addr(wallet);
    const value = call.value ?? 0n;
    const [nonce, gas, fees] = await Promise.all([
      client.getTransactionCount({ address: from, blockTag: "pending" }),
      client.estimateGas({ account: from, to: call.to, data: call.data, value }),
      client.estimateFeesPerGas(),
    ]);
    const tx: EvmTx = {
      to: call.to, value: toHex(value), data: call.data, chain_id: ROBINHOOD_CHAIN.id, nonce,
      gas_limit: toHex((gas * 12n) / 10n), max_fee_per_gas: toHex(fees.maxFeePerGas), max_priority_fee_per_gas: toHex(fees.maxPriorityFeePerGas), type: 2,
    };
    const signed = await d.privy.signEvmTransaction(walletId, tx);
    const hash = await client.sendRawTransaction({ serializedTransaction: signed });
    await onSigned?.(hash);
    let receipt: TransactionReceipt;
    try {
      receipt = await client.waitForTransactionReceipt({ hash, timeout: 90_000 });
    } catch (err) {
      // Broadcast but not seen confirmed: it may still land, so callers must not treat this as "did not happen".
      const e = new Error(`transaction ${hash} was sent but not confirmed: ${err instanceof Error ? err.message.slice(0, 120) : String(err)}`);
      e.name = "AmbiguousSendError";
      throw e;
    }
    if (receipt.status !== "success") throw new Error(`transaction ${hash} reverted`);
    return receipt;
  }

  /** Where `token` trades right now. Throws for a non-Pons, non-ETH or mid-graduation token. */
  async function market(token: string): Promise<Market> {
    const l = await client.readContract({ address: PONS_FACTORY, abi: FACTORY_ABI, functionName: "getLaunchedToken", args: [addr(token)] });
    if (!l.exists) throw new Error(`${token} is not a Pons token`);
    if (l.pairToken !== NATIVE) throw new Error(`${token} is not priced in ETH`);
    if (l.phase === Phase.PoolCreated) return { kind: "pool", pool: ponsPool(addr(token), l.poolFee, l.tickSpacing) };
    if (l.phase !== Phase.NotGraduated) throw new Error(`${token} is graduating; its pool is not open yet`);
    const [[quote, tokens], feeBps, taxBps, sellable] = await Promise.all([
      client.readContract({ address: l.curve, abi: CURVE_ABI, functionName: "getReserves" }),
      client.readContract({ address: l.curve, abi: CURVE_ABI, functionName: "feeBps" }),
      client.readContract({ address: l.curve, abi: CURVE_ABI, functionName: "creatorTaxBps" }),
      client.readContract({ address: l.curve, abi: CURVE_ABI, functionName: "sellableTokens" }),
    ]);
    if (sellable === 0n) throw new Error(`${token} is graduating; its pool is not open yet`);
    return { kind: "curve", curve: l.curve, reserves: { quote, tokens, feeBps, taxBps } };
  }

  /** The curve's own record of this fill. */
  function curveFill(receipt: TransactionReceipt, curve: Address, side: "CurveBuy" | "CurveSell") {
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== curve.toLowerCase()) continue;
      try {
        const e = decodeEventLog({ abi: CURVE_ABI, data: log.data, topics: log.topics });
        if (e.eventName === "CurveBuy" && side === "CurveBuy") return { eth: e.args.quoteIn, tokens: e.args.tokensOut };
        if (e.eventName === "CurveSell" && side === "CurveSell") return { eth: e.args.quoteOut, tokens: e.args.tokensIn };
      } catch {
        /* another event */
      }
    }
    throw new Error(`no ${side} event in ${receipt.transactionHash}`);
  }

  /** Raw token units moved into (+) or out of (-) `wallet` in this receipt. */
  function tokenDelta(receipt: TransactionReceipt, token: string, wallet: string): bigint {
    let delta = 0n;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== token.toLowerCase()) continue;
      try {
        const e = decodeEventLog({ abi: TRANSFER_ABI, data: log.data, topics: log.topics });
        if (e.args.to.toLowerCase() === wallet.toLowerCase()) delta += e.args.value;
        if (e.args.from.toLowerCase() === wallet.toLowerCase()) delta -= e.args.value;
      } catch {
        /* not a Transfer */
      }
    }
    return delta;
  }

  async function quotePool(pool: PoolKey, buy: boolean, amountIn: bigint): Promise<bigint> {
    const { result } = await client.simulateContract({ address: V4_QUOTER, abi: QUOTER_ABI, functionName: "quoteExactInputSingle", args: [{ poolKey: pool, zeroForOne: buy, exactAmount: amountIn, hookData: "0x" }] });
    return result[0];
  }

  async function approve(walletId: string, wallet: string, token: Address, spender: Address, amount: bigint) {
    const allowance = await client.readContract({ address: token, abi: ERC20_ABI, functionName: "allowance", args: [addr(wallet), spender] });
    if (allowance < amount) await send(walletId, wallet, { to: token, data: encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [spender, maxUint256] }) });
  }

  async function permitRouter(walletId: string, wallet: string, token: Address, amount: bigint) {
    await approve(walletId, wallet, token, PERMIT2, amount);
    const [allowed, expiration] = await client.readContract({ address: PERMIT2, abi: PERMIT2_ABI, functionName: "allowance", args: [addr(wallet), token, UNIVERSAL_ROUTER] });
    if (allowed >= amount && BigInt(expiration) * 1000n > BigInt(Date.now()) + 3_600_000n) return;
    await send(walletId, wallet, { to: PERMIT2, data: encodeFunctionData({ abi: PERMIT2_ABI, functionName: "approve", args: [token, UNIVERSAL_ROUTER, maxUint160, Number(MAX_UINT48)] }) });
  }

  const deadline = () => BigInt(Math.floor(Date.now() / 1000) + 300);

  // Whether a token is a Pons V2 launch priced in ETH never changes: answer once per token per process.
  const tradableCache = new Map<string, boolean>();
  async function tradable(token: string): Promise<boolean> {
    const key = token.toLowerCase();
    const hit = tradableCache.get(key);
    if (hit !== undefined) return hit;
    try {
      const l = await client.readContract({ address: PONS_FACTORY, abi: FACTORY_ABI, functionName: "getLaunchedToken", args: [addr(token)] });
      const ok = l.exists && l.pairToken === NATIVE;
      if (tradableCache.size > 20_000) tradableCache.clear();
      tradableCache.set(key, ok);
      return ok;
    } catch {
      return false; // unknown this time: skip it, ask again next tick
    }
  }

  const executor = {
    market,

    /**
     * Only the tokens this executor can trade: GeckoTerminal's Pons lists also carry tokens from Pons V1 and other
     * paths, which the V2 factory does not know.
     */
    async onlyTradable<C extends { token: string }>(candidates: C[]): Promise<C[]> {
      const ok = await Promise.all(candidates.map((c) => tradable(c.token)));
      return candidates.filter((_, i) => ok[i]);
    },

    async buy(a: TradeArgs & { wei: bigint }): Promise<Fill> {
      const token = addr(a.token);
      const wei = a.wei;
      if (wei <= 0n) throw new Error("buy amount must be positive");
      const m = await market(token);
      if (m.kind === "curve") {
        const least = minOut(quoteCurveBuy(wei, m.reserves), a.slippageBps);
        const data = encodeFunctionData({ abi: CURVE_ABI, functionName: "buy", args: [wei, least, addr(a.wallet)] });
        const receipt = await send(a.walletId, a.wallet, { to: m.curve, value: wei, data }, a.onSigned);
        const f = curveFill(receipt, m.curve, "CurveBuy");
        return { hash: receipt.transactionHash, wei: f.eth, tokens: f.tokens };
      }
      const least = minOut(await quotePool(m.pool, true, wei), a.slippageBps);
      const data = encodeFunctionData({ abi: ROUTER_ABI, functionName: "execute", args: v4SwapCall(m.pool, true, wei, least, deadline()) });
      const receipt = await send(a.walletId, a.wallet, { to: UNIVERSAL_ROUTER, value: wei, data }, a.onSigned);
      return { hash: receipt.transactionHash, wei, tokens: tokenDelta(receipt, token, a.wallet) };
    },

    async sell(a: TradeArgs & { tokens: bigint }): Promise<Fill> {
      const token = addr(a.token);
      if (a.tokens <= 0n) throw new Error("sell amount must be positive");
      const m = await market(token);
      if (m.kind === "curve") {
        await approve(a.walletId, a.wallet, token, m.curve, a.tokens);
        const least = minOut(quoteCurveSell(a.tokens, m.reserves), a.slippageBps);
        const data = encodeFunctionData({ abi: CURVE_ABI, functionName: "sell", args: [a.tokens, least, addr(a.wallet)] });
        const receipt = await send(a.walletId, a.wallet, { to: m.curve, data }, a.onSigned);
        const f = curveFill(receipt, m.curve, "CurveSell");
        return { hash: receipt.transactionHash, wei: f.eth, tokens: f.tokens };
      }
      await permitRouter(a.walletId, a.wallet, token, a.tokens);
      const least = minOut(await quotePool(m.pool, false, a.tokens), a.slippageBps);
      const before = await client.getBalance({ address: addr(a.wallet) });
      const data = encodeFunctionData({ abi: ROUTER_ABI, functionName: "execute", args: v4SwapCall(m.pool, false, a.tokens, least, deadline()) });
      const receipt = await send(a.walletId, a.wallet, { to: UNIVERSAL_ROUTER, data }, a.onSigned);
      // ETH arrives as a plain transfer: the balance change plus the gas this tx paid.
      const after = await client.getBalance({ address: addr(a.wallet), blockNumber: receipt.blockNumber });
      const received = after - before + receipt.gasUsed * receipt.effectiveGasPrice;
      return { hash: receipt.transactionHash, wei: received > 0n ? received : 0n, tokens: a.tokens };
    },

    /** Quote without trading: tokens for `wei` on a buy, or wei for `tokens` on a sell, fees included. */
    async quote(token: string, side: "buy" | "sell", amount: bigint): Promise<bigint> {
      const m = await market(token);
      if (m.kind === "curve") return side === "buy" ? quoteCurveBuy(amount, m.reserves) : quoteCurveSell(amount, m.reserves);
      return quotePool(m.pool, side === "buy", amount);
    },

    /** Sends ETH out; the wallet's policy only allows the owner and the treasury. */
    async transfer(a: { walletId: string; wallet: string; to: string; wei: bigint }): Promise<string> {
      return (await send(a.walletId, a.wallet, { to: addr(a.to), value: a.wei, data: "0x" })).transactionHash;
    },

    /** Spendable ETH in wei, after the gas reserve. */
    async spendable(wallet: string): Promise<bigint> {
      const balance = await client.getBalance({ address: addr(wallet) });
      return balance > reserve ? balance - reserve : 0n;
    },

    tokenBalance: (wallet: string, token: string) => client.readContract({ address: addr(token), abi: ERC20_ABI, functionName: "balanceOf", args: [addr(wallet)] }),

    /** ETH per whole token: the curve's sell price, or the pool's quote once graduated. Unknown ones are left out. */
    async prices(tokens: string[]): Promise<Map<string, number>> {
      const one = 10n ** BigInt(PONS_DECIMALS);
      const out = new Map<string, number>();
      await Promise.all(
        tokens.map(async (t) => {
          try {
            const m = await market(t);
            // ponytail: the sell quote for 1 whole token, fees included: a slight underestimate, never an overstatement.
            const wei = m.kind === "curve" ? quoteCurveSell(one, m.reserves) : await quotePool(m.pool, false, one);
            if (wei > 0n) out.set(t, Number(wei) / 1e18);
          } catch {
            /* unknown, graduating or unquotable: no price this tick */
          }
        }),
      );
      return out;
    },

    /**
     * The agent's creator fees, to its wallet: sweep its own token's curve into the escrow (while it still trades on
     * the curve), then claim the escrow. Null when nothing was owed.
     */
    async claimCreatorFees(a: { walletId: string; wallet: string; token: string }): Promise<{ hash: string; wei: bigint } | null> {
      const l = await client.readContract({ address: PONS_FACTORY, abi: FACTORY_ABI, functionName: "getLaunchedToken", args: [addr(a.token)] });
      if (l.exists && l.phase === Phase.NotGraduated) {
        await send(a.walletId, a.wallet, { to: l.curve, data: encodeFunctionData({ abi: CURVE_ABI, functionName: "sweepFees", args: [0n] }) }).catch(() => undefined);
      }
      const owed = await client.readContract({ address: PONS_FEE_ESCROW, abi: ESCROW_ABI, functionName: "balanceOf", args: [addr(a.wallet)] });
      if (owed === 0n) return null;
      const receipt = await send(a.walletId, a.wallet, { to: PONS_FEE_ESCROW, data: encodeFunctionData({ abi: ESCROW_ABI, functionName: "claim" }) });
      return { hash: receipt.transactionHash, wei: owed };
    },

    /** Launch the agent's token on Pons (ETH-quoted, buyback off, no creator tax). The launch fee is read live. */
    async launchToken(a: { walletId: string; wallet: string; name: string; symbol: string; logo: string; description: string; website: string }): Promise<{ token: string; curve: string; hash: string }> {
      const fee = await client.readContract({ address: PONS_FACTORY, abi: FACTORY_ABI, functionName: "launchFee" });
      const params = {
        name: a.name, symbol: a.symbol, logo: a.logo, description: a.description,
        socials: { twitter: "", telegram: "", discord: "", website: a.website, farcaster: "" },
        creatorFeeRecipient: addr(a.wallet), creatorTaxBps: 0, buybackEnabled: false, expectedEconomics: zeroHash,
        salt: toHex(BigInt(Date.now()), { size: 32 }),
      };
      const data = encodeFunctionData({ abi: FACTORY_ABI, functionName: "launchToken", args: [params, 0n, NATIVE] });
      const receipt = await send(a.walletId, a.wallet, { to: PONS_FACTORY, value: fee, data });
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== PONS_FACTORY.toLowerCase()) continue;
        try {
          const e = decodeEventLog({ abi: FACTORY_ABI, data: log.data, topics: log.topics });
          if (e.eventName === "TokenLaunched") return { token: e.args.token, curve: e.args.curve, hash: receipt.transactionHash };
        } catch {
          /* another event */
        }
      }
      throw new Error(`launch ${receipt.transactionHash} emitted no TokenLaunched`);
    },
  };
  return executor;
}

export type Executor = ReturnType<typeof createExecutor>;
