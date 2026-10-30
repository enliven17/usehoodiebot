import { erc20Abi, getAddress, isAddressEqual, isHash, parseEventLogs, type Hash } from "viem";

import { publicClient } from "@/lib/chain/robinhood";
import { api, mutate, query } from "@/lib/db";
import { isAdmin } from "@/lib/server/access";
import { FEE_WALLET } from "@/lib/server/fees";
import { fail } from "@/lib/server/http";
import { limited } from "@/lib/server/limit";
import { isCoin, isPlan, PLANS, priceWei, WIF } from "@/lib/server/plans";
import { currentOwner } from "@/lib/session";

/**
 * Books a plan from the owner's payment: the transaction must have succeeded on Robinhood Chain, come from the
 * signed-in wallet and moved at least the plan's price to FEE_WALLET, as ETH or as a $WIF transfer. Each hash counts
 * once. ETH needs an approved application; $WIF skips the waitlist.
 */
export async function POST(req: Request) {
  const owner = await currentOwner();
  if (!owner) return fail(401, "Sign in first.");
  const slow = await limited(owner, "pay");
  if (slow) return slow;
  const body = (await req.json().catch(() => null)) as { plan?: unknown; hash?: unknown; coin?: unknown } | null;
  const coin = body?.coin ?? "eth";
  if (!isPlan(body?.plan) || !isCoin(coin) || typeof body?.hash !== "string" || !isHash(body.hash)) return fail(400, "Pick a plan and send its payment.");
  const plan = body.plan;
  const hash = body.hash as Hash;
  if (coin === "eth" && !isAdmin(owner) && (await query(api.applications.get, { owner }))?.status !== "approved") return fail(403, "Your application is not approved yet. Pay in $WIF to skip the waitlist.");

  const client = publicClient();
  const [tx, receipt] = await Promise.all([client.getTransaction({ hash }).catch(() => null), client.getTransactionReceipt({ hash }).catch(() => null)]);
  if (!tx || !receipt) return fail(409, "The payment is not confirmed yet. Give it a few seconds.");
  if (receipt.status !== "success") return fail(400, "That transaction failed onchain.");
  if (getAddress(tx.from) !== getAddress(owner)) return fail(400, "Pay from the wallet you signed in with.");
  const paid =
    coin === "eth"
      ? tx.to && getAddress(tx.to) === FEE_WALLET
        ? tx.value
        : 0n
      : parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs: receipt.logs })
          .filter((l) => isAddressEqual(l.address, WIF) && isAddressEqual(l.args.from, owner) && isAddressEqual(l.args.to, FEE_WALLET))
          .reduce((sum, l) => sum + l.args.value, 0n);
  if (paid === 0n) return fail(400, "That payment did not go to Hoodie.");
  if (paid < priceWei(plan, coin)) return fail(400, `The ${PLANS[plan].name} plan is ${coin === "wif" ? `${PLANS[plan].wif} $WIF` : `${PLANS[plan].eth} ETH`}.`);

  const booked = await mutate(api.subscriptions.pay, { owner, hash, plan, coin, wei: paid.toString(), days: PLANS[plan].days });
  if (!booked) return fail(409, "That payment is already used.");
  return Response.json(booked);
}
