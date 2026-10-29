/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as applications from "../applications.js";
import type * as approvals from "../approvals.js";
import type * as book from "../book.js";
import type * as chat from "../chat.js";
import type * as chatTrades from "../chatTrades.js";
import type * as crons from "../crons.js";
import type * as events from "../events.js";
import type * as fees from "../fees.js";
import type * as guard from "../guard.js";
import type * as limits from "../limits.js";
import type * as memories from "../memories.js";
import type * as sessions from "../sessions.js";
import type * as strategies from "../strategies.js";
import type * as subscriptions from "../subscriptions.js";
import type * as teams from "../teams.js";
import type * as usage from "../usage.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  applications: typeof applications;
  approvals: typeof approvals;
  book: typeof book;
  chat: typeof chat;
  chatTrades: typeof chatTrades;
  crons: typeof crons;
  events: typeof events;
  fees: typeof fees;
  guard: typeof guard;
  limits: typeof limits;
  memories: typeof memories;
  sessions: typeof sessions;
  strategies: typeof strategies;
  subscriptions: typeof subscriptions;
  teams: typeof teams;
  usage: typeof usage;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
