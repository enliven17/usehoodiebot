import { robinhoodAgentPolicy } from "@/lib/chain/policy";
import { getPrivy } from "@/lib/chain/privy";
import { api, mutate, query } from "@/lib/db";
import { isAdmin } from "@/lib/server/access";
import { safeMessage as errorText } from "@/lib/server/errors";
import { FEE_WALLET } from "@/lib/server/fees";
import { fail } from "@/lib/server/http";
import { currentOwner } from "@/lib/session";

export const maxDuration = 300;

/**
 * Rebuilds every team wallet's policy from the current rules (after a rule is added, such as the commission) and
 * attaches it in place of the old one. Admin only; safe to run again.
 */
export async function POST() {
  if (!isAdmin(await currentOwner())) return fail(404, "Not found.");
  const privy = getPrivy();
  const out: Array<{ wallet: string; ok: boolean; error?: string }> = [];
  for (const t of await query(api.teams.all, {})) {
    try {
      const policyId = await privy.replacePolicy(t.walletId, robinhoodAgentPolicy(t.wallet, t.owner, null, FEE_WALLET));
      await mutate(api.teams.setPolicy, { owner: t.owner, policyId });
      out.push({ wallet: t.wallet, ok: true });
    } catch (err) {
      out.push({ wallet: t.wallet, ok: false, error: errorText(err) });
    }
  }
  return Response.json({ updated: out.filter((r) => r.ok).length, failed: out.filter((r) => !r.ok) });
}
