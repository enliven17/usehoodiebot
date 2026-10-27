import type { Metadata } from "next";

import { Doc } from "@/components/doc/Doc";
import { Hoodie } from "@/components/Hoodie";
import { MEMBERS, TEAM } from "@/lib/team";

const description = "How Hoodie works: a private trading team for Pons tokens on Robinhood Chain.";
export const metadata: Metadata = { title: "Litepaper", description, openGraph: { title: "Hoodie Litepaper", description, images: [{ url: "/og/litepaper.png", width: 1200, height: 630 }] } };

export default function Litepaper() {
  return (
    <Doc title="Litepaper" updated="October 2026" figure={MEMBERS.map((m) => <Hoodie key={m} member={m} size={m === "hoodiebot" ? 72 : 52} />)}>
      <p>
        Hoodie is a private trading team for the memecoins launched on Pons, on Robinhood Chain. You talk to one bot. It hands the work
        to four specialists, and they trade from a wallet that belongs to your team alone, inside rules you can read.
      </p>

      <h2>The problem</h2>
      <p>
        New tokens launch on Pons every few minutes. The ones worth a look move in the first hour, while you are asleep, at work or
        looking at another chart. Watching by hand means missing most of them. Trading by hand means breaking your own rules on the
        hundredth token because the first ninety-nine were boring.
      </p>

      <h2>The team</h2>
      <table>
        <thead><tr><th>Bot</th><th>Job</th></tr></thead>
        <tbody>
          {MEMBERS.map((m) => <tr key={m}><td>{TEAM[m].name}</td><td>{TEAM[m].job}</td></tr>)}
        </tbody>
      </table>
      <p>
        Hoodie is a Claude model with tools. Each specialist is a set of those tools: ResearchBot reads GeckoTerminal and the chain,
        SniperBot saves and runs Strategies, ShieldBot checks every token before a buy (creator holdings and selling, honeypots, one
        buyer split across wallets, how concentrated the buying is) and blocks the bad ones outright, TraderBot puts trades in front
        of you, LaunchBot reads the live launch fee and checks a
        name and symbol. What one of them finds stays in the conversation, so the next one starts from it.
      </p>

      <h2>Strategies</h2>
      <p>A Strategy says what to watch, what has to pass, how much to spend and when to get out.</p>
      <ul>
        <li><strong>Watch</strong>: new Pons launches (under two hours old), any token on the curve, graduated pools, or all of them.</li>
        <li><strong>Filters</strong>: market cap, liquidity, last-hour volume, curve progress, age, and buys against sells over the last hour.</li>
        <li><strong>Size</strong>: 0.0005 to 1 ETH per entry, slippage 0.5% to 15%, at most ten open positions per Strategy.</li>
        <li><strong>Exit</strong>: take profit and stop loss, checked against the live sell quote.</li>
        <li><strong>On a match</strong>: ask before each trade, or trade automatically.</li>
      </ul>
      <p>
        SniperBot checks every running Strategy once a minute. A token is matched at most once per Strategy. Approvals that wait more
        than fifteen minutes expire instead of trading on an old price.
      </p>

      <h2>The wallet</h2>
      <p>
        Each team gets its own server wallet on Robinhood Chain (chain id <code>4663</code>), held by Privy. Its signing policy denies
        everything by default. It allows only:
      </p>
      <ul>
        <li>buys and sells on a Pons bonding curve that pay out to the wallet itself;</li>
        <li>swaps through the Uniswap v4 UniversalRouter and the Permit2 approvals they need, once a token has graduated;</li>
        <li>token approvals, so a curve or Permit2 can take the tokens being sold;</li>
        <li>ETH sent to the owner, the address that signed in.</li>
      </ul>
      <p>
        Nobody, including us and including the bot, can send the ETH anywhere else: the policy is checked by Privy before a
        transaction is signed. A small gas reserve (0.0003 ETH) always stays in the wallet. You can withdraw the rest at any time.
      </p>

      <h2>Trading</h2>
      <p>
        While a token is on its Pons curve, Hoodie trades the curve directly. Once 4.2 ETH has been raised it graduates into a
        Uniswap v4 pool and Hoodie routes there instead, quoting through the V4 Quoter so the Pons hook fee is included. Every trade
        has a minimum output set from your slippage, and every position is booked from the transaction receipt, never from the quote.
      </p>

      <h2>$HOODIE</h2>
      <p>
        $HOODIE is the team&apos;s token, launched on Pons. The contract address is posted on the home page and on X when it is live;
        anything else claiming to be $HOODIE is not.
      </p>

      <h2>Risks</h2>
      <ul>
        <li>Tokens on a bonding curve can lose most of their value in minutes. Many go to zero.</li>
        <li>A Strategy follows its rules exactly, including into a bad market.</li>
        <li>Slippage, gas and Pons fees are paid on every trade.</li>
        <li>The model can misread a situation. Keep trades on &ldquo;ask&rdquo; until you trust a Strategy, and only fund the wallet with what you can lose.</li>
      </ul>
      <p>None of this is financial advice.</p>
    </Doc>
  );
}
