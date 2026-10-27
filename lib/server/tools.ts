import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import { formatEther, parseEther } from "viem";

import { addressUrl } from "../chain/robinhood";
import { candidates, type Candidate } from "../chain/market";
import { FACTORY_ABI, PONS_FACTORY } from "../chain/pons";
import { publicClient } from "../chain/robinhood";
import { api, mutate, query } from "../db";
import { describe, parseSpec, SPEC_LIMITS, WATCH_LABEL } from "../strategy";
import type { Member } from "../team";
import { getExecutor, normalizeToken, propose, type Team } from "./team";

type Tool = Anthropic.Beta.BetaTool & { member: Member; run: (team: Team, input: Record<string, unknown>) => Promise<unknown> };

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
}, ["watch", "sizeEth"]);

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
      if (!(await ex.onlyTradable([{ token }])).length) return { error: "Not a Pons V2 token priced in ETH; HOODIEBOT does not trade it." };
      const [m, listed, quote] = await Promise.all([ex.market(token), candidates().then((l) => l.find((c) => c.token === token)), ex.quote(token, "buy", parseEther("0.01")).catch(() => null)]);
      return { token, explorer: addressUrl(token), tradesOn: m.kind === "curve" ? "Pons bonding curve" : "Uniswap v4 (graduated)", market: listed ? brief(listed) : null, tokensFor001Eth: quote === null ? null : formatEther(quote) };
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
      const a = await propose(team.owner, { kind: i.kind === "sell" ? "sell" : "buy", token, symbol: String(i.symbol).slice(0, 24), amount: i.kind === "buy" ? parseEther(String(eth)) : 0n, reason: String(i.reason).slice(0, 280), strategyId: null });
      return { approvalId: a.id, status: "waiting for the owner", expiresInMinutes: 15 };
    },
  },
  {
    name: "create_strategy", member: "sniper",
    description: "Save a Strategy SniperBot checks every minute. mode 'ask' puts each match up for approval; 'auto' trades it without asking. Use 'ask' unless the owner clearly asked for automatic trading.",
    input_schema: obj({ name: { type: "string" }, mode: { type: "string", enum: ["ask", "auto"] }, spec: SPEC_SCHEMA }, ["name", "mode", "spec"]),
    async run(team, i) {
      const spec = parseSpec(i.spec);
      const id = await mutate(api.strategies.create, { owner: team.owner, name: String(i.name).slice(0, 60), spec, mode: i.mode === "auto" ? "auto" : "ask", limit: 5 });
      if (!id) return { error: "Five strategies are already running. Pause one first." };
      return { id, watching: WATCH_LABEL[spec.watch], rules: describe(spec), mode: i.mode === "auto" ? "trades automatically" : "asks before each trade" };
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
    description: "Pause, resume, or switch a strategy between 'ask' and 'auto'.",
    input_schema: obj({ id: { type: "string" }, active: { type: "boolean" }, mode: { type: "string", enum: ["ask", "auto"] } }, ["id"]),
    async run(team, i) {
      const ok = await mutate(api.strategies.update, { owner: team.owner, id: String(i.id), ...(typeof i.active === "boolean" ? { active: i.active } : {}), ...(i.mode === "ask" || i.mode === "auto" ? { mode: i.mode } : {}) });
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
export const apiTools = (): Anthropic.Beta.BetaTool[] => TOOLS.map(({ member: _m, run: _r, ...t }) => t);

export async function runTool(team: Team, name: string, input: unknown): Promise<{ content: string; isError: boolean }> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { content: `Unknown tool ${name}`, isError: true };
  try {
    const out = await tool.run(team, (input && typeof input === "object" ? input : {}) as Record<string, unknown>);
    const isError = !!out && typeof out === "object" && "error" in out;
    return { content: JSON.stringify(out), isError };
  } catch (err) {
    return { content: `Failed: ${err instanceof Error ? err.message.slice(0, 300) : String(err)}`, isError: true };
  }
}
