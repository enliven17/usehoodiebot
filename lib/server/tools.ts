import "server-only";

import { formatEther, parseEther } from "viem";

import { addressUrl } from "../chain/robinhood";
import { candidates, candles, searchTokens, tokenMarket, type Candidate } from "../chain/market";
import { CARD_TOOL, type TradeCard } from "../lines";
import { journal } from "../journal";
import { PRESETS, presetById } from "../presets";
import { readBars } from "../ta";
import { backtest } from "./backtest";
import { afterFee } from "./fees";
import { shield } from "../chain/shield";
import { FACTORY_ABI, PONS_FACTORY } from "../chain/pons";
import { publicClient } from "../chain/robinhood";
import { api, mutate, query } from "../db";
import { describe, parseSpec, SPEC_LIMITS, WATCH_LABEL } from "../strategy";
import type { Member } from "../team";
import { safeMessage } from "./errors";
import { logEvent, type TeamEvent } from "./events";
import type { ToolDef } from "./llm";
import { getExecutor, normalizeToken, propose, type Team } from "./team";

type Tool = { name: string; description: string; input_schema: Record<string, unknown>; member: Member; run: (team: Team, input: Record<string, unknown>) => Promise<unknown> };

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object" as const, properties, required, additionalProperties: false });
const usd = (n?: number) => (n === undefined ? null : Math.round(n));
const brief = (c: Candidate) => ({
  token: c.token, symbol: c.symbol, venue: c.venue, priceEth: c.priceEth, mcapUsd: usd(c.mcapUsd), liquidityUsd: usd(c.liquidityUsd),
  volume1hUsd: usd(c.volume1hUsd), curvePct: c.curvePct === undefined ? null : Number(c.curvePct.toFixed(1)),
  ageMinutes: c.ageMinutes === undefined ? null : Math.round(c.ageMinutes), buys1h: c.buys1h ?? null, sells1h: c.sells1h ?? null,
});

const SPEC_SCHEMA = obj({
  watch: { type: "string", enum: ["new", "curve", "graduated", "all"], description: "new = Pons launches under 2h old on their curve" },
  sizeEth: { type: "number", description: `ETH per entry, ${SPEC_LIMITS.sizeEth[0]}–${SPEC_LIMITS.sizeEth[1]}` },
  slippageBps: { type: "number", description: "max slippage in basis points, default 300" },
  maxOpen: { type: "number", description: "max open positions from this strategy, default 3" },
  minMcapUsd: { type: "number" }, maxMcapUsd: { type: "number" }, minLiquidityUsd: { type: "number" }, minVolume1hUsd: { type: "number" },
  minCurvePct: { type: "number" }, maxCurvePct: { type: "number" }, maxAgeMinutes: { type: "number" },
  minBuySellRatio: { type: "number", description: "buys divided by sells over the last hour" },
  takeProfitPct: { type: "number" }, stopLossPct: { type: "number" },
  trailingStopPct: { type: "number", description: "sell once the price falls this % from its high while held" },
  minSafetyScore: { type: "number", description: "ShieldBot score 0-100 a token needs; size grows from half at the bar to full at 100. 60 is a sensible default." },
}, ["watch", "sizeEth"]);

/** ShieldBot's read on a token, with the pool looked up when the caller does not have it. */
const safetyOf = async (token: string) => {
  const listed = (await candidates().catch(() => [])).find((c) => c.token === token);
  const pool = listed?.pool ?? (await tokenMarket(token).catch(() => null))?.pool;
  return shield(token, pool);
};

export const TOOLS: Tool[] = [
  {
    name: "scan_market", member: "research",
    description: "List Pons tokens on Robinhood Chain right now from GeckoTerminal: fresh launches and the busiest curve and graduated tokens, with market cap, liquidity, curve progress, age and last-hour buys/sells.",
    input_schema: obj({ venue: { type: "string", enum: ["curve", "graduated", "any"] }, limit: { type: "number", description: "default 12, max 30" } }),
    async run(_t, i) {
      const list = (await candidates()).filter((c) => !i.venue || i.venue === "any" || c.venue === i.venue);
      return list.slice(0, Math.min(30, Number(i.limit) || 12)).map(brief);
    },
  },
  {
    name: "research_token", member: "research",
    description: "Read one Pons token: where it trades (bonding curve or Uniswap v4), its market data if listed, and what a 0.01 ETH buy would get right now including fees.",
    input_schema: obj({ token: { type: "string", description: "0x token address" } }, ["token"]),
    async run(_t, i) {
      const token = normalizeToken(i.token);
      if (!token) return { error: "Not a token address." };
      const ex = getExecutor();
      if (!(await ex.onlyTradable([{ token }])).length) return { error: "Not a Pons V2 token priced in ETH; Hoodie does not trade it." };
      const [m, listed, quote] = await Promise.all([ex.market(token), candidates().then((l) => l.find((c) => c.token === token)), ex.quote(token, "buy", parseEther("0.01")).catch(() => null)]);
      return { token, explorer: addressUrl(token), tradesOn: m.kind === "curve" ? "Pons bonding curve" : "Uniswap v4 (graduated)", market: listed ? brief(listed) : null, tokensFor001Eth: quote === null ? null : formatEther(quote) };
    },
  },
  {
    name: "find_token", member: "research",
    description: "Find Pons tokens by symbol, name or address when the owner names one (\"buy some PEPE\"). Returns up to 5 tradable matches, busiest first, with address, market cap, liquidity and age, so you can say which one you mean.",
    input_schema: obj({ query: { type: "string", description: "symbol, name, or 0x address" } }, ["query"]),
    async run(_t, i) {
      const q = String(i.query ?? "").trim().replace(/^\$/, "");
      if (!q) return { error: "Say which token." };
      const address = normalizeToken(q);
      const found = address ? [await tokenMarket(address).catch(() => null)].filter((c): c is NonNullable<typeof c> => !!c) : await searchTokens(q).catch(() => []);
      const listed = (await candidates().catch(() => [])).filter((c) => c.symbol.toLowerCase() === q.toLowerCase());
      const all = [...listed, ...found].filter((c, k, a) => a.findIndex((x) => x.token === c.token) === k);
      const tradable = await getExecutor().onlyTradable(all.slice(0, 8)).catch(() => all);
      return tradable.slice(0, 5).map(brief);
    },
  },
  {
    name: CARD_TOOL, member: "trader",
    description: "When the owner asks in chat to buy or sell a specific token, lay the trade out as a card in the chat: ticker, price, market cap, ShieldBot score and what they get. Nothing trades until they press Buy or Sell on the card. Use it for every direct buy or sell request; ask which token first if find_token returns more than one plausible match.",
    input_schema: obj({ side: { type: "string", enum: ["buy", "sell"] }, token: { type: "string" }, symbol: { type: "string" }, ethAmount: { type: "number", description: "buy: ETH to spend" }, pct: { type: "number", description: "sell: share of the holding, 1-100, default 100" } }, ["side", "token", "symbol"]),
    async run(team, i) {
      const token = normalizeToken(i.token);
      const ex = getExecutor();
      if (!token || !(await ex.onlyTradable([{ token }])).length) return { error: "Not a tradable Pons token priced in ETH." };
      const side = i.side === "sell" ? "sell" : "buy";
      const eth = Number(i.ethAmount);
      if (side === "buy" && !(eth >= SPEC_LIMITS.sizeEth[0] && eth <= SPEC_LIMITS.sizeEth[1])) return { error: `Buy size must be ${SPEC_LIMITS.sizeEth[0]}–${SPEC_LIMITS.sizeEth[1]} ETH. Ask how much.` };
      const pct = side === "sell" ? Math.min(100, Math.max(1, Number(i.pct) || 100)) : null;
      const [market, held, safety] = await Promise.all([
        tokenMarket(token).catch(() => null),
        ex.tokenBalance(team.wallet, token).catch(() => 0n),
        side === "buy" ? safetyOf(token).catch(() => null) : Promise.resolve(null),
      ]);
      if (side === "sell" && held === 0n) return { error: "The team wallet holds none of it." };
      const amount = side === "buy" ? afterFee(parseEther(String(eth))) : (held * BigInt(Math.round(pct! * 100))) / 10_000n;
      const out = await ex.quote(token, side, amount).then((o) => Number(side === "buy" ? o : afterFee(o)) / 1e18).catch(() => null);
      const card: Omit<TradeCard, "id"> = {
        side, token, symbol: market?.symbol ?? String(i.symbol).slice(0, 24), venue: market?.venue ?? null,
        ethAmount: side === "buy" ? eth : null, pct, priceEth: market?.priceEth ?? null, mcapUsd: market?.mcapUsd ?? null, out,
        held: Number(held) / 1e18,
        safety: safety ? { score: safety.score, blocked: safety.blocks.length > 0, note: safety.blocks[0] ?? safety.warns[0] ?? "Nothing flagged." } : side === "buy" ? { score: -1, blocked: false, note: "ShieldBot could not check it just now; you are buying it unchecked." } : null,
        at: Date.now(),
      };
      return { card, shown: "The owner sees a card with a confirm button; tell them to check it and press it. Do not say it traded." };
    },
  },
  {
    name: "technical_read", member: "research",
    description: "Read a token's chart: trend (EMA 9 against 21), RSI, last-candle volume against its average, distance from the high and from the volume-weighted average price, as plain signals. Use it before calling an entry good or late.",
    input_schema: obj({ token: { type: "string" }, timeframe: { type: "string", enum: ["1m", "5m", "15m", "1h"], description: "default 5m" } }, ["token"]),
    async run(_t, i) {
      const token = normalizeToken(i.token);
      if (!token) return { error: "Not a token address." };
      const m = await tokenMarket(token);
      if (!m) return { error: "No chart for it yet." };
      const tf = (["1m", "5m", "15m", "1h"] as const).find((x) => x === i.timeframe) ?? "5m";
      const read = readBars(await candles(m.pool, tf));
      return read ? { token, symbol: m.symbol, timeframe: tf, ...read } : { error: "Too few candles to read yet." };
    },
  },
  {
    name: "backtest_strategy", member: "sniper",
    description: "Replay a strategy's exits (take profit, stop loss, trailing stop) on recent Pons tokens of the kind it watches, fees included: win rate, average and median return, best and worst, profit factor, P&L and drawdown at its size. Give a preset id or a spec. Say plainly it tests exits on tokens still listed, not the entry filters.",
    input_schema: obj({ preset: { type: "string", enum: PRESETS.map((p) => p.id) }, spec: { ...SPEC_SCHEMA, required: [] } }),
    async run(_t, i) {
      const spec = parseSpec({ ...(presetById(i.preset)?.spec ?? { watch: "new", sizeEth: 0.01 }), ...((i.spec as object) ?? {}) });
      const r = await backtest(spec);
      return { rules: describe(spec), ...r, tokens: r.tokens.map((x) => ({ symbol: x.symbol, returnPct: Number(x.returnPct.toFixed(1)), exit: x.reason, heldCandles: x.heldBars })) };
    },
  },
  {
    name: "review_trades", member: "trader",
    description: "The owner's trade journal from their closed positions: win rate, P&L, average win and loss, profit factor, how long winners and losers were held, hand trades against strategies, and the habits behind the numbers. Use it when they ask how they are doing or why they lose.",
    input_schema: obj({}),
    async run(team) {
      const closed = await query(api.book.closed, { owner: team.owner });
      return journal(closed.map((p) => ({ symbol: p.symbol, costEth: Number(formatEther(BigInt(p.costWei))), proceedsEth: Number(formatEther(BigInt(p.proceedsWei))), openedAt: p.openedAt, closedAt: p.closedAt, byStrategy: p.byStrategy }))) ?? { closed: 0, note: "No closed trades yet." };
    },
  },
  {
    name: "remember", member: "hoodiebot",
    description: "Keep a note across every future chat when the owner states a preference or a rule (\"never more than 0.05 ETH a trade\", \"I like launches under 10 minutes\"). One short sentence, in the owner's terms.",
    input_schema: obj({ note: { type: "string" } }, ["note"]),
    async run(team, i) {
      const note = String(i.note ?? "").trim().slice(0, 280);
      if (!note) return { error: "Nothing to remember." };
      const id = await mutate(api.memories.add, { owner: team.owner, text: note });
      return id ? { id, remembered: note } : { error: "Memory is full (40 notes). Ask the owner which to forget." };
    },
  },
  {
    name: "forget", member: "hoodiebot",
    description: "Drop a note the owner no longer wants kept. Use the id from the notes in your instructions.",
    input_schema: obj({ id: { type: "string" } }, ["id"]),
    async run(team, i) {
      return (await mutate(api.memories.remove, { owner: team.owner, id: String(i.id ?? "") })) ? { ok: true } : { error: "No such note." };
    },
  },
  {
    name: "check_safety", member: "shield",
    description: "ShieldBot's safety read on one token before any buy: honeypot flag, how much the creator still holds and whether they sold, holder count and top-10 share, whether one buyer is split across wallets (same odd buy size), how concentrated the recent buying is, and socials. Returns blocks (never buy), warnings, and a 0-100 score.",
    input_schema: obj({ token: { type: "string", description: "0x token address" } }, ["token"]),
    async run(_t, i) {
      const token = normalizeToken(i.token);
      if (!token) return { error: "Not a token address." };
      const s = await safetyOf(token);
      return { token, score: s.score, blocked: s.blocks.length > 0, blocks: s.blocks, warnings: s.warns, facts: s.facts };
    },
  },
  {
    name: "get_wallet", member: "hoodiebot",
    description: "The team wallet: its address, the ETH it can trade (after a small gas reserve) and the open positions with their current value.",
    input_schema: obj({}),
    async run(team) {
      const ex = getExecutor();
      const open = await query(api.book.open, { owner: team.owner });
      const [spendable, prices] = await Promise.all([ex.spendable(team.wallet), ex.prices(open.map((p) => p.token))]);
      return {
        wallet: team.wallet, spendableEth: formatEther(spendable),
        positions: open.map((p) => {
          const price = prices.get(p.token);
          const value = price === undefined ? null : (Number(p.tokens) / 1e18) * price;
          return { token: p.token, symbol: p.symbol, costEth: formatEther(BigInt(p.costWei)), valueEth: value === null ? null : value.toFixed(6), openedAt: new Date(p.openedAt).toISOString() };
        }),
      };
    },
  },
  {
    name: "propose_trade", member: "trader",
    description: "Put a trade in front of the owner for approval. Nothing trades until they press Approve. For a buy give ethAmount; a sell closes the whole position.",
    input_schema: obj({ kind: { type: "string", enum: ["buy", "sell"] }, token: { type: "string" }, symbol: { type: "string" }, ethAmount: { type: "number" }, reason: { type: "string", description: "one sentence the owner reads on the approval card" } }, ["kind", "token", "symbol", "reason"]),
    async run(team, i) {
      const token = normalizeToken(i.token);
      if (!token || !(await getExecutor().onlyTradable([{ token }])).length) return { error: "Not a tradable Pons token." };
      const eth = Number(i.ethAmount);
      if (i.kind === "buy" && !(eth >= SPEC_LIMITS.sizeEth[0] && eth <= SPEC_LIMITS.sizeEth[1])) return { error: `Buy size must be ${SPEC_LIMITS.sizeEth[0]}–${SPEC_LIMITS.sizeEth[1]} ETH.` };
      // ShieldBot has the last word on buys: a blocked token is never put in front of the owner
      if (i.kind !== "sell") {
        const s = await safetyOf(token).catch(() => null);
        if (s?.blocks.length) return { error: `ShieldBot blocks this buy. ${s.blocks.join(" ")}` };
      }
      const a = await propose(team.owner, { kind: i.kind === "sell" ? "sell" : "buy", token, symbol: String(i.symbol).slice(0, 24), amount: i.kind === "buy" ? parseEther(String(eth)) : 0n, reason: String(i.reason).slice(0, 280), strategyId: null });
      return { approvalId: a.id, status: "waiting for the owner", expiresInMinutes: 15 };
    },
  },
  {
    name: "create_strategy", member: "sniper",
    description: "Save a Strategy SniperBot checks every minute. Every match is put up for the owner's approval. Only the owner can make a strategy trade automatically: in the Team tab, with Autopilot on and a budget.",
    input_schema: obj({ name: { type: "string" }, preset: { type: "string", enum: PRESETS.map((p) => p.id), description: `start from a ready-made strategy: ${PRESETS.map((p) => `${p.id} (${p.name}: ${p.pitch})`).join("; ")}. Fields in spec override it.` }, spec: { ...SPEC_SCHEMA, required: [] } }, ["name"]),
    async run(team, i) {
      const spec = parseSpec({ ...(presetById(i.preset)?.spec ?? { watch: "new", sizeEth: 0.01 }), ...((i.spec as object) ?? {}) });
      // Always "ask": tool input can be steered by token names in market data, so the model never turns on automatic trading.
      const id = await mutate(api.strategies.create, { owner: team.owner, name: String(i.name).slice(0, 60), spec, mode: "ask", limit: 5 });
      if (!id) return { error: "Five strategies are already running. Pause one first." };
      return { id, watching: WATCH_LABEL[spec.watch], rules: describe(spec), mode: "asks before each trade; the owner can make it automatic in the Team tab under Autopilot" };
    },
  },
  {
    name: "list_strategies", member: "sniper",
    description: "The owner's strategies with their rules, mode and whether they are running.",
    input_schema: obj({}),
    async run(team) {
      const rows = await query(api.strategies.byOwner, { owner: team.owner });
      return rows.map((r) => ({ id: r.id, name: r.name, mode: r.mode, active: r.active, watching: WATCH_LABEL[parseSpec(r.spec).watch], rules: describe(parseSpec(r.spec)) }));
    },
  },
  {
    name: "update_strategy", member: "sniper",
    description: "Pause or resume a strategy. Automatic trading is only for the owner to switch on, in the Team tab under Autopilot.",
    input_schema: obj({ id: { type: "string" }, active: { type: "boolean" } }, ["id", "active"]),
    async run(team, i) {
      const ok = await mutate(api.strategies.update, { owner: team.owner, id: String(i.id), ...(typeof i.active === "boolean" ? { active: i.active } : {}) });
      return ok ? { ok: true } : { error: "No such strategy." };
    },
  },
  {
    name: "prepare_launch", member: "launch",
    description: "What launching a token on Pons takes right now: the live launch fee and the fields needed (name, symbol, logo URL, description). LaunchBot checks the name and symbol; launches themselves happen from the app's Launch panel.",
    input_schema: obj({ name: { type: "string" }, symbol: { type: "string" } }),
    async run(_t, i) {
      const fee = await publicClient().readContract({ address: PONS_FACTORY, abi: FACTORY_ABI, functionName: "launchFee" });
      const symbol = String(i.symbol ?? "");
      return {
        launchFeeEth: formatEther(fee), venue: "Pons V2 on Robinhood Chain, priced in ETH, graduates to Uniswap v4 at 4.2 ETH raised",
        checks: { name: String(i.name ?? "").length >= 2 && String(i.name ?? "").length <= 32, symbol: /^[A-Z0-9]{2,10}$/.test(symbol) },
        needs: ["name", "symbol (2–10 capitals or digits)", "logo image URL", "one-line description"],
      };
    },
  },
];

export const TOOL_MEMBER = Object.fromEntries(TOOLS.map((t) => [t.name, t.member])) as Record<string, Member>;
export const apiTools = (): ToolDef[] => TOOLS.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } }));

export async function runTool(team: Team, name: string, input: unknown): Promise<{ content: string; isError: boolean }> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { content: `Unknown tool ${name}`, isError: true };
  try {
    const args = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
    const out = await tool.run(team, args);
    const isError = !!out && typeof out === "object" && "error" in out;
    const event = isError ? null : timeline(name, args, out);
    if (event) await logEvent(team.owner, event);
    return { content: JSON.stringify(out), isError };
  } catch (err) {
    return { content: `Failed: ${safeMessage(err)}`, isError: true };
  }
}

/** The decisions worth a line on the timeline; reads (wallet, strategy list) are left out. */
function timeline(name: string, args: Record<string, unknown>, out: unknown): TeamEvent | null {
  const o = (out ?? {}) as Record<string, unknown>;
  const symbol = typeof args.symbol === "string" ? args.symbol.slice(0, 24) : undefined;
  const token = typeof args.token === "string" ? args.token : undefined;
  switch (name) {
    case "scan_market":
      return Array.isArray(out) ? { member: "research", kind: "scan", text: `Scanned ${out.length} Pons tokens.` } : null;
    case "research_token": {
      const m = o.market as { symbol?: string; curvePct?: number | null; liquidityUsd?: number | null } | null;
      const what = m ? `${m.symbol}: ${m.curvePct ?? "?"}% up its curve, $${(m.liquidityUsd ?? 0).toLocaleString("en-US")} liquidity` : "a token that is not listed yet";
      return { member: "research", kind: "research", text: `Read ${what}, on ${String(o.tradesOn ?? "Pons")}.`, token: String(o.token ?? token ?? ""), symbol: m?.symbol };
    }
    case "backtest_strategy": {
      const sm = o.summary as { trades: number; winRatePct: number; avgReturnPct: number } | null;
      return sm ? { member: "sniper", kind: "backtest", text: `Backtested a strategy on ${sm.trades} tokens: ${sm.winRatePct.toFixed(0)}% won, ${sm.avgReturnPct >= 0 ? "+" : ""}${sm.avgReturnPct.toFixed(1)}% on average after fees.` } : null;
    }
    case "remember":
      return { member: "hoodiebot", kind: "memory", text: `Will remember: ${String(o.remembered ?? "")}` };
    case "check_safety":
      return { member: "shield", kind: "safety", text: o.blocked ? `Blocked a token: ${String((o.blocks as string[])[0] ?? "")}` : `Safety ${String(o.score)}/100${(o.warnings as string[]).length ? `: ${(o.warnings as string[]).join(" ")}` : ", nothing flagged."}`, token: String(o.token ?? token ?? "") };
    case "propose_trade":
      return { member: "trader", kind: "ask", text: `Put a ${args.kind === "sell" ? "sell" : `${args.ethAmount} ETH buy`} of ${symbol} up for your approval: ${String(args.reason ?? "").slice(0, 160)}`, token, symbol };
    case "create_strategy":
      return { member: "sniper", kind: "strategy", text: `Saved the strategy "${String(args.name ?? "").slice(0, 60)}", watching ${String(o.watching ?? "Pons")}.` };
    case "update_strategy":
      return { member: "sniper", kind: "strategy", text: args.active ? "Resumed a strategy." : "Paused a strategy." };
    default:
      return null;
  }
}
