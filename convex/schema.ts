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
    /** The open conversation. History is append-only within a thread; a new chat starts the next one. */
    thread: v.number(),
  }).index("by_owner", ["owner"]),

  /** The Claude API's own content blocks as JSON text, so thinking blocks go back byte for byte. */
  messages: defineTable({
    owner: v.string(),
    thread: v.number(),
    role: v.union(v.literal("user"), v.literal("assistant")),
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
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("skipped"), v.literal("expired"), v.literal("done"), v.literal("failed")),
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
  })
    .index("by_owner_open", ["owner", "closedAt"])
    .index("by_strategy_open", ["strategyId", "closedAt"]),

  trades: defineTable({
    owner: v.string(),
    side: v.union(v.literal("buy"), v.literal("sell")),
    token: v.string(),
    symbol: v.string(),
    wei: v.string(),
    tokens: v.string(),
    hash: v.string(),
  }).index("by_owner", ["owner"]),
});
