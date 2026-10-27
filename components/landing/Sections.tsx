import Link from "next/link";

import { Hoodie } from "@/components/Hoodie";
import { Logo } from "@/components/Logo";
import { MEMBERS, TEAM } from "@/lib/team";

import s from "./landing.module.css";

export function Nav() {
  return (
    <header className={s.nav}>
      <Link href="/" className={s.brand} aria-label="HOODIEBOT home"><Logo /></Link>
      <nav className={s.links} aria-label="Sections">
        <a href="#product">Product</a>
        <a href="#strategies">Strategies</a>
        <a href="#team">The team</a>
        <a href="#wallet">Wallet</a>
        <Link href="/litepaper">Litepaper</Link>
      </nav>
      <div className={s.navEnd}>
        <a className="btn" href="https://x.com/usehoodiebot" rel="noopener">X</a>
        <Link className="btn btn-primary" href="/app">Open app</Link>
      </div>
    </header>
  );
}

export function Product() {
  return (
    <section id="product" className={s.section}>
      <div className={s.split}>
        <div>
          <div className={s.sectionHead}>
            <h2 className={s.h2}>One message. The whole team moves.</h2>
            <p className={s.sub}>
              Tell HOODIEBOT what you want done in plain words. It sends the work to the right specialist, keeps what they find, and
              only brings you in when a trade needs your yes.
            </p>
          </div>
          <ul className={s.points}>
            <li>
              <h3>Research that is reused</h3>
              <p>ResearchBot reads holders, curve progress, liquidity and the last hour of buys and sells. TraderBot trades off that read instead of starting over.</p>
            </li>
            <li>
              <h3>Desktop or phone</h3>
              <p>The same thread everywhere. An approval waits for you, it does not expire into a trade.</p>
            </li>
          </ul>
        </div>
        <div className={s.panel} role="img" aria-label="An example conversation with HOODIEBOT">
          <div className={s.thread}>
            <div className={`${s.msg} ${s.msgMe}`}>
              <div className={s.bubble}>Find me something fresh on Pons with real buyers. 0.02 ETH max.</div>
            </div>
            <div className={s.msg}>
              <Hoodie member="research" size={34} mood="searching" />
              <div className={s.bubble}>
                <span className={s.by}>ResearchBot</span>
                LODGER is 41 minutes old and 9% up its curve, with buys outpacing sells 3 to 1 in the last hour.
                <dl className={s.facts}>
                  <div><dt>Liquidity</dt><dd>$11.8k</dd></div>
                  <div><dt>Market cap</dt><dd>$24.1k</dd></div>
                  <div><dt>Curve</dt><dd>8.7%</dd></div>
                </dl>
              </div>
            </div>
            <div className={s.msg}>
              <Hoodie size={34} mood="listening" />
              <div className={s.bubble}>
                <span className={s.by}>HOODIEBOT</span>
                It passes your checks. TraderBot has the entry ready.
                <div className={s.approve}>
                  <span className="num">Buy 0.02 ETH of LODGER</span>
                  <span className="btn">Skip</span>
                  <span className="btn btn-primary">Approve</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Strategies() {
  return (
    <section id="strategies" className={s.section}>
      <div className={s.split}>
        <div className={`${s.panel} ${s.strategy}`}>
          <dl style={{ margin: 0 }}>
            <div className={s.row}><dt>Watch</dt><dd><span className={s.pill}>New Pons launches</span></dd></div>
            <div className={s.row}>
              <dt>Filters</dt>
              <dd>
                <span className={s.pill}>mcap ≤ $60k</span>
                <span className={s.pill}>liquidity ≥ $5k</span>
                <span className={s.pill}>curve 5–60%</span>
                <span className={s.pill}>age ≤ 2h</span>
                <span className={s.pill}>size 0.01 ETH</span>
                <span className={s.pill}>slippage 3%</span>
              </dd>
            </div>
            <div className={s.row}><dt>Must pass</dt><dd><span className={s.pill}>ResearchBot read</span><span className={s.pill}>buys &gt; sells, 1h</span></dd></div>
            <div className={s.row}><dt>Exit</dt><dd><span className={s.pill}>take profit +80%</span><span className={s.pill}>stop −35%</span></dd></div>
            <div className={s.row}>
              <dt>On a match</dt>
              <dd><span className={s.seg}><span aria-current="true">Ask before each trade</span><span>Trade automatically</span></span></dd>
            </div>
          </dl>
        </div>
        <div>
          <div className={s.sectionHead}>
            <h2 className={s.h2}>A Strategy is your rules, written once.</h2>
            <p className={s.sub}>Choose what to watch, what has to pass, and what happens when something matches. HOODIEBOT checks the market every minute.</p>
          </div>
          <ul className={s.points}>
            <li><h3>Cover more of the market</h3><p>Every new Pons launch and every graduated pool, read while you are away.</p></li>
            <li><h3>Keep your rules consistent</h3><p>The same filters on the hundredth token as on the first. No chasing.</p></li>
            <li><h3>Skip the repetitive work</h3><p>Write it in a sentence. HOODIEBOT turns it into a Strategy you can read and edit.</p></li>
          </ul>
        </div>
      </div>
    </section>
  );
}

export function Team() {
  return (
    <section id="team" className={s.section}>
      <div className={s.sectionHead}>
        <h2 className={s.h2}>Five specialists. One hood.</h2>
        <p className={s.sub}>They share what they find, so nothing is read twice.</p>
      </div>
      <div className={s.team}>
        {MEMBERS.map((m) => (
          <div key={m} className={`${s.member} ${s.panel}`}>
            <Hoodie member={m} size={96} mood={m === "sniper" ? "suspicious" : m === "research" ? "searching" : m === "trader" ? "working" : m === "launch" ? "happy" : "idle"} />
            <h3>{TEAM[m].name}</h3>
            <p>{TEAM[m].job}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Wallet() {
  return (
    <section id="wallet" className={s.section}>
      <div className={s.sectionHead}>
        <h2 className={s.h2}>Its own wallet, on a short leash.</h2>
        <p className={s.sub}>Your team trades from a server wallet made for it alone. You fund it, you set the size, and you can take it all back.</p>
      </div>
      <div className={s.rules}>
        <div className={`${s.rule} ${s.panel}`}>
          <h3>Deny by default</h3>
          <p>The wallet&apos;s signing policy allows Pons curves, the Uniswap v4 router and Permit2 on chain <code>4663</code>. Anything else is refused before it is signed.</p>
        </div>
        <div className={`${s.rule} ${s.panel}`}>
          <h3>Withdrawals go to you</h3>
          <p>ETH can only leave to the address that owns the team. Not to us, not to anyone the bot is talked into.</p>
        </div>
        <div className={`${s.rule} ${s.panel}`}>
          <h3>Fills from the chain</h3>
          <p>Every position is booked from the transaction receipt, never from a quote. Slippage is capped on every trade.</p>
        </div>
      </div>
    </section>
  );
}

export function Venues() {
  return (
    <section className={s.section}>
      <div className={s.sectionHead}>
        <h2 className={s.h2}>Where it trades</h2>
        <p className={s.sub}>Robinhood Chain mainnet. Tokens on their Pons bonding curve, and on Uniswap v4 once they graduate.</p>
      </div>
      <div className={s.venues}>
        {["Robinhood Chain", "Pons", "Uniswap v4", "GeckoTerminal", "Blockscout"].map((v) => <span key={v} className="chip">{v}</span>)}
      </div>
    </section>
  );
}

export function Closing() {
  return (
    <section className={s.section}>
      <div className={`${s.panel} ${s.closing}`}>
        <Hoodie size={120} mood="happy" />
        <h2 className={s.h2}>Put your team to work.</h2>
        <Link className="btn btn-primary btn-lg" href="/app">Open HOODIEBOT</Link>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className={s.footer}>
      <Logo size={18} />
      <nav aria-label="Footer">
        <Link href="/litepaper">Litepaper</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/privacy">Privacy</Link>
        <a href="https://x.com/usehoodiebot" rel="noopener">X</a>
      </nav>
      <p>Not financial advice. Tokens on a bonding curve can go to zero in minutes; only fund the wallet with what you can lose.</p>
    </footer>
  );
}
