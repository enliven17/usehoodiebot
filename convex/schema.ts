import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/** One team per owner (the EVM address that signed in). Amounts are decimal strings of wei / raw token units. */
export default defineSchema({
  teams: defineTable({
    owner: v.string(),
    wallet: v.string(),
    walletId: v.string(),
    policyId: v.string(),
    /** One transaction at a time per wallet (nonces): a lease the Next server takes and returns. */
    busyUntil: v.optional(v.number()),
    /** Who holds the lease, so a holder whose lease expired cannot release someone else's. */
    busyToken: v.optional(v.string()),
    /** The open conversation. History is append-only within a thread; a new chat starts the next one. */
    thread: v.number(),
    /** The highest thread number used: an older chat can be reopened, a new one always goes past this. */
    lastThread: v.optional(v.number()),
  }).index("by_owner", ["owner"]),

  /** Each chat message as JSON text (OpenAI-style: user, assistant with tool calls, tool results). */
  messages: defineTable({
    owner: v.string(),
    thread: v.number(),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("tool")),
    content: v.string(),
  }).index("by_thread", ["owner", "thread"]),

  strategies: defineTable({
    owner: v.string(),
    name: v.string(),
    spec: v.any(),
    mode: v.union(v.literal("ask"), v.literal("auto")),
    active: v.boolean(),
  })
    .index("by_owner", ["owner"])
    .index("by_active", ["active"]),

  /** A token a strategy already matched: never matched twice. */
  matches: defineTable({ strategyId: v.id("strategies"), token: v.string() }).index("by_strategy_token", ["strategyId", "token"]),

  approvals: defineTable({
    owner: v.string(),
    strategyId: v.optional(v.id("strategies")),
    kind: v.union(v.literal("buy"), v.literal("sell")),
    token: v.string(),
    symbol: v.string(),
    amount: v.string(),
    reason: v.string(),
    /** "sent": broadcast but not confirmed in time; the tick settles it from the receipt. */
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("skipped"), v.literal("expired"), v.literal("sent"), v.literal("done"), v.literal("failed")),
    result: v.optional(v.any()),
    decidedAt: v.optional(v.number()),
  })
    .index("by_owner", ["owner"])
    .index("by_status", ["status"]),

  positions: defineTable({
    owner: v.string(),
    strategyId: v.optional(v.id("strategies")),
    token: v.string(),
    symbol: v.string(),
    tokens: v.string(),
    costWei: v.string(),
    closedAt: v.optional(v.number()),
    proceedsWei: v.optional(v.string()),
    /** Exits the owner set on a hand-bought position; the tick sells it when one is hit. */
    takeProfitPct: v.optional(v.number()),
    stopLossPct: v.optional(v.number()),
    trailingStopPct: v.optional(v.number()),
    /** the highest price (ETH per token) seen while held: what a trailing stop measures from */
    peakEth: v.optional(v.number()),
  })
    .index("by_owner_open", ["owner", "closedAt"])
    .index("by_open", ["closedAt"])
    .index("by_strategy_open", ["strategyId", "closedAt"]),

  /** What the team decided and did, newest first in the app: matches, research, asks, fills, exits, skips. */
  events: defineTable({
    owner: v.string(),
    member: v.union(v.literal("hoodiebot"), v.literal("research"), v.literal("sniper"), v.literal("trader"), v.literal("launch"), v.literal("shield")),
    kind: v.string(),
    text: v.string(),
    token: v.optional(v.string()),
    symbol: v.optional(v.string()),
    hash: v.optional(v.string()),
    /** ETH moved, signed: negative when it left the wallet (a buy), positive when it came back (a sell). */
    wei: v.optional(v.string()),
  }).index("by_owner", ["owner"]),

  /** Who asked to get in, what they answered, and the admin's call. Nobody gets a team wallet before "approved". */
  applications: defineTable({
    owner: v.string(),
    answers: v.any(),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")),
    decidedAt: v.optional(v.number()),
    decidedBy: v.optional(v.string()),
  })
    .index("by_owner", ["owner"])
    .index("by_status", ["status"]),

  trades: defineTable({
    owner: v.string(),
    side: v.union(v.literal("buy"), v.literal("sell")),
    token: v.string(),
    symbol: v.string(),
    wei: v.string(),
    tokens: v.string(),
    hash: v.string(),
  })
    .index("by_owner", ["owner"])
    .index("by_owner_token", ["owner", "token"]),
});
