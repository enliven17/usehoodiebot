import type { Metadata } from "next";

import { Doc } from "@/components/doc/Doc";

export const metadata: Metadata = { title: "Privacy" };

export default function Privacy() {
  return (
    <Doc title="Privacy" updated="October 2026">
      <p>Hoodie keeps what it needs to run your team and nothing else.</p>
      <h2>What we keep</h2>
      <ul>
        <li>Your wallet address, which is how you sign in. No email, no name.</li>
        <li>Your team wallet&apos;s address and its Privy id.</li>
        <li>Your conversation with Hoodie, your Strategies, approvals, positions and trades.</li>
      </ul>
      <h2>Who sees it</h2>
      <ul>
        <li><strong>Anthropic</strong> receives your messages and the tool results to generate Hoodie&apos;s replies.</li>
        <li><strong>Privy</strong> holds the team wallet and signs its transactions under its policy.</li>
        <li><strong>Convex</strong> stores the records above. <strong>Vercel</strong> hosts the site.</li>
        <li>Everything your team does on chain is public on Robinhood Chain, like any transaction.</li>
      </ul>
      <p>We do not sell data and we do not run ads or third-party trackers.</p>
      <h2>Cookies</h2>
      <p>One cookie keeps you signed in for 30 days, and one short-lived cookie holds the sign-in challenge.</p>
    </Doc>
  );
}
