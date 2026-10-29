import { getAddress, isHash, type Hash } from "viem";

import { publicClient } from "@/lib/chain/robinhood";
import { api, mutate, query } from "@/lib/db";
import { isAdmin } from "@/lib/server/access";
import { FEE_WALLET } from "@/lib/server/fees";
import { fail } from "@/lib/server/http";
import { limited } from "@/lib/server/limit";
import { isPlan, PLANS, priceWei } from "@/lib/server/plans";
import { currentOwner } from "@/lib/session";

/**
 * Books a plan from the owner's ETH transfer: the transaction must have succeeded on Robinhood Chain, come from the
 * signed-in wallet, gone to FEE_WALLET and carried at least the plan's price. Each hash counts once.
 */
export async function POST(req: Request) {
  const owner = await currentOwner();
  if (!owner) return fail(401, "Sign in first.");
  const slow = await limited(owner, "pay");
  if (slow) return slow;
  const body = (await req.json().catch(() => null)) as { plan?: unknown; hash?: unknown } | null;
  if (!isPlan(body?.plan) || typeof body?.hash !== "string" || !isHash(body.hash)) return fail(400, "Pick a plan and send its payment.");
  const plan = body.plan;
  const hash = body.hash as Hash;
  if (!isAdmin(owner) && (await query(api.applications.get, { owner }))?.status !== "approved") return fail(403, "Your application is not approved yet.");

  const client = publicClient();
  const [tx, receipt] = await Promise.all([client.getTransaction({ hash }).catch(() => null), client.getTransactionReceipt({ hash }).catch(() => null)]);
  if (!tx || !receipt) return fail(409, "The payment is not confirmed yet. Give it a few seconds.");
  if (receipt.status !== "success") return fail(400, "That transaction failed onchain.");
  if (getAddress(tx.from) !== getAddress(owner)) return fail(400, "Pay from the wallet you signed in with.");
  if (!tx.to || getAddress(tx.to) !== FEE_WALLET) return fail(400, "That payment did not go to Hoodie.");
  if (tx.value < priceWei(plan)) return fail(400, `The ${PLANS[plan].name} plan is ${PLANS[plan].eth} ETH.`);

  const booked = await mutate(api.subscriptions.pay, { owner, hash, plan, wei: tx.value.toString(), days: PLANS[plan].days });
  if (!booked) return fail(409, "That payment is already used.");
  return Response.json(booked);
}
