import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { guard, secret } from "./guard";

/**
 * Positions and fills, booked from transaction receipts by the Next server. Every function takes `paper`: the paper
 * book lives in paperPositions and paperTrades, the same fields and indexes, and paper fills move the team's paperWei.
 */
const paper = v.optional(v.boolean());
// ponytail: the paper tables mirror the live ones field for field; the cast lets one query serve both
const P = (on?: boolean) => (on ? "paperPositions" : "positions") as "positions";
const T = (on?: boolean) => (on ? "paperTrades" : "trades") as "trades";
export const PAPER_START_WEI = (10n ** 18n).toString();

async function movePaper(ctx: { db: import("./_generated/server").DatabaseWriter }, owner: string, delta: bigint) {
  const t = await ctx.db.query("teams").withIndex("by_owner", (q) => q.eq("owner", owner)).unique();
  if (t) await ctx.db.patch(t._id, { paperWei: (BigInt(t.paperWei ?? PAPER_START_WEI) + delta).toString() });
}
const position = (p: Doc<"positions">) => ({ id: p._id as string, owner: p.owner, strategyId: (p.strategyId as string | undefined) ?? null, token: p.token, symbol: p.symbol, tokens: p.tokens, costWei: p.costWei, openedAt: p._creationTime, takeProfitPct: p.takeProfitPct ?? null, stopLossPct: p.stopLossPct ?? null, trailingStopPct: p.trailingStopPct ?? null, peakEth: p.peakEth ?? null });

export const open = query({
  args: { secret, paper, owner: v.string() },
  handler: async (ctx, a) => {
    guard(a.secret);
    return (await ctx.db.query(P(a.paper)).withIndex("by_owner_open", (q) => q.eq("owner", a.owner).eq("closedAt", undefined)).order("desc").collect()).map(position);
  },
});

export const openForStrategy = query({
  args: { secret, paper, strategyId: v.id("strategies") },
  handler: async (ctx, a) => {
    guard(a.secret);
    return (await ctx.db.query(P(a.paper)).withIndex("by_strategy_open", (q) => q.eq("strategyId", a.strategyId).eq("closedAt", undefined)).collect()).map(position);
  },
});

export const bought = mutation({
  args: { secret, paper, owner: v.string(), strategyId: v.optional(v.id("strategies")), token: v.string(), symbol: v.string(), tokens: v.string(), wei: v.string(), hash: v.string(), takeProfitPct: v.optional(v.number()), stopLossPct: v.optional(v.number()), trailingStopPct: v.optional(v.number()) },
  handler: async (ctx, { secret: s, paper: on, wei, hash, ...p }) => {
    guard(s);
    await ctx.db.insert(P(on), { ...p, costWei: wei });
    await ctx.db.insert(T(on), { owner: p.owner, side: "buy", token: p.token, symbol: p.symbol, wei, tokens: p.tokens, hash });
    if (on) await movePaper(ctx, p.owner, -BigInt(wei));
  },
});

/**
 * A sell. It closes `positionId` when given (a strategy exit sells exactly that position), and every open position in
 * the token when `closes` (the wallet holds none of it any more).
 */
export const sold = mutation({
  args: { secret, paper, owner: v.string(), token: v.string(), symbol: v.string(), tokens: v.string(), wei: v.string(), hash: v.string(), closes: v.boolean(), positionId: v.optional(v.string()) },
  handler: async (ctx, a) => {
    guard(a.secret);
    await ctx.db.insert(T(a.paper), { owner: a.owner, side: "sell", token: a.token, symbol: a.symbol, wei: a.wei, tokens: a.tokens, hash: a.hash });
    if (a.paper) await movePaper(ctx, a.owner, BigInt(a.wei));
    const open = (await ctx.db.query(P(a.paper)).withIndex("by_owner_open", (q) => q.eq("owner", a.owner).eq("closedAt", undefined)).collect()).filter((p) => p.token === a.token);
    for (const p of open) {
      if (a.closes || p._id === a.positionId) await ctx.db.patch(p._id, { closedAt: Date.now(), proceedsWei: a.closes && p._id !== a.positionId ? "0" : a.wei });
    }
  },
});

/** Closed positions, newest first: realized profit and loss. */
export const closed = query({
  args: { secret, paper, owner: v.string() },
  handler: async (ctx, a) => {
    guard(a.secret);
    const rows = await ctx.db.query(P(a.paper)).withIndex("by_owner_open", (q) => q.eq("owner", a.owner).gt("closedAt", 0)).collect();
    return rows.map((p) => ({ symbol: p.symbol, costWei: p.costWei, proceedsWei: p.proceedsWei ?? "0", closedAt: p.closedAt!, openedAt: p._creationTime, byStrategy: !!p.strategyId }));
  },
});

export const trades = query({
  args: { secret, paper, owner: v.string() },
  handler: async (ctx, a) => {
    guard(a.secret);
    return (await ctx.db.query(T(a.paper)).withIndex("by_owner", (q) => q.eq("owner", a.owner)).order("desc").take(20)).map((t) => ({ side: t.side, symbol: t.symbol, wei: t.wei, hash: t.hash, at: t._creationTime }));
  },
});

/** Every fill in one token, oldest first: the buy and sell marks on its chart. */
export const tradesFor = query({
  args: { secret, paper, owner: v.string(), token: v.string() },
  handler: async (ctx, a) => {
    guard(a.secret);
    const rows = await ctx.db.query(T(a.paper)).withIndex("by_owner_token", (q) => q.eq("owner", a.owner).eq("token", a.token)).take(200);
    return rows.map((t) => ({ side: t.side, wei: t.wei, tokens: t.tokens, hash: t.hash, at: t._creationTime }));
  },
});

/** Tokens the team has traded, newest first, one row each. */
export const tradedTokens = query({
  args: { secret, paper, owner: v.string() },
  handler: async (ctx, a) => {
    guard(a.secret);
    const rows = await ctx.db.query(T(a.paper)).withIndex("by_owner", (q) => q.eq("owner", a.owner)).order("desc").take(200);
    const seen = new Set<string>();
    return rows.filter((t) => !seen.has(t.token) && seen.add(t.token)).map((t) => ({ token: t.token, symbol: t.symbol, at: t._creationTime }));
  },
});

/** Sets (or clears, with undefined) the exits on the owner's open hand-bought positions in a token. */
export const setExits = mutation({
  args: { secret, paper, owner: v.string(), token: v.string(), takeProfitPct: v.optional(v.number()), stopLossPct: v.optional(v.number()), trailingStopPct: v.optional(v.number()) },
  handler: async (ctx, a) => {
    guard(a.secret);
    const open = (await ctx.db.query(P(a.paper)).withIndex("by_owner_open", (q) => q.eq("owner", a.owner).eq("closedAt", undefined)).collect()).filter((p) => p.token === a.token && !p.strategyId);
    for (const p of open) await ctx.db.patch(p._id, { takeProfitPct: a.takeProfitPct, stopLossPct: a.stopLossPct, trailingStopPct: a.trailingStopPct });
    return open.length;
  },
});

/** Every open position with an exit the owner set, across owners and both books: the tick watches these. */
export const withExits = query({
  args: { secret },
  handler: async (ctx, a) => {
    guard(a.secret);
    const out = [];
    for (const on of [false, true]) {
      const open = await ctx.db.query(P(on)).withIndex("by_open", (q) => q.eq("closedAt", undefined)).take(500);
      out.push(...open.filter((p) => p.takeProfitPct !== undefined || p.stopLossPct !== undefined || p.trailingStopPct !== undefined).map((p) => ({ ...position(p), paper: on })));
    }
    return out;
  },
});

/** Raises a position's recorded high; a lower price leaves it alone. */
export const peak = mutation({
  args: { secret, paper, id: v.string(), priceEth: v.number() },
  handler: async (ctx, a) => {
    guard(a.secret);
    const id = ctx.db.normalizeId(P(a.paper), a.id);
    const p = id && (await ctx.db.get(id));
    if (p && p.closedAt === undefined && a.priceEth > (p.peakEth ?? 0)) await ctx.db.patch(p._id, { peakEth: a.priceEth });
  },
});

/** Switches the team between paper and live trading. */
export const setMode = mutation({
  args: { secret, owner: v.string(), mode: v.union(v.literal("paper"), v.literal("live")) },
  handler: async (ctx, a) => {
    guard(a.secret);
    const t = await ctx.db.query("teams").withIndex("by_owner", (q) => q.eq("owner", a.owner)).unique();
    if (t) await ctx.db.patch(t._id, { mode: a.mode });
  },
});

/** Starts the paper book over: every paper position and fill gone, the balance back to 1 ETH. */
export const resetPaper = mutation({
  args: { secret, owner: v.string() },
  handler: async (ctx, a) => {
    guard(a.secret);
    for (const p of await ctx.db.query("paperPositions").withIndex("by_owner_open", (q) => q.eq("owner", a.owner)).collect()) await ctx.db.delete(p._id);
    for (const t of await ctx.db.query("paperTrades").withIndex("by_owner", (q) => q.eq("owner", a.owner)).collect()) await ctx.db.delete(t._id);
    const t = await ctx.db.query("teams").withIndex("by_owner", (q) => q.eq("owner", a.owner)).unique();
    if (t) await ctx.db.patch(t._id, { paperWei: PAPER_START_WEI });
  },
});
