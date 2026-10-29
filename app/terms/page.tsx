import type { Metadata } from "next";

import { Doc } from "@/components/doc/Doc";

export const metadata: Metadata = { title: "Terms" };

export default function Terms() {
  return (
    <Doc title="Terms" updated="October 2026">
      <p>By using Hoodie you agree to these terms. If you do not agree, do not use it.</p>
      <h2>What Hoodie is</h2>
      <p>
        Software that researches and trades tokens on Robinhood Chain for you, from a wallet created for your team, under the rules
        you set. It is not a broker, an exchange, an adviser or a custodian of anything other than that wallet&apos;s signing key,
        which is held by Privy under a policy that only lets it trade on Pons and Uniswap v4 and pay out to you.
      </p>
      <h2>Your responsibility</h2>
      <ul>
        <li>You decide what the team trades and how much. Automatic Strategies trade without asking you, by design.</li>
        <li>You are responsible for following the laws that apply to you, including on trading digital assets.</li>
        <li>You only fund the wallet with what you can afford to lose.</li>
      </ul>
      <h2>Fees and access</h2>
      <p>
        Hoodie takes 0.5% of the ETH in every buy and every sell your team makes, by hand, by approval or automatically, sent from the
        team wallet right after the trade. The order ticket shows it before you trade. Network fees are on top. Access is by
        application, then a monthly or yearly plan paid in ETH from the wallet you sign in with. Plans are not refunded and do not renew
        by themselves. Fees and prices can change; the app always shows the current ones.
      </p>
      <h2>No advice, no guarantees</h2>
      <p>
        Nothing Hoodie says is financial advice. Market data comes from third parties and can be late or wrong. The model can be
        wrong. Trades can fail, fill at a worse price than quoted within your slippage, or lose everything.
      </p>
      <h2>Availability</h2>
      <p>The service is provided as is. It can be paused, changed or stopped. Your funds stay withdrawable to your address on chain.</p>
      <h2>Liability</h2>
      <p>To the extent the law allows, we are not liable for trading losses or for losses caused by third-party services, networks or contracts.</p>
    </Doc>
  );
}
