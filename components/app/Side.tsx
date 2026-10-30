"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";

import { Hoodie } from "@/components/Hoodie";
import { SpecList } from "@/components/SpecList";
import { StatusButton } from "@/components/ui/StatusButton";
import { addressUrl, txUrl } from "@/lib/chain/robinhood-urls";

import { api, type Snapshot } from "./api";
import s from "./app.module.css";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const eth = (n: number | string | null, d = 4) => (n === null ? "–" : `${Number(n).toFixed(d)} ETH`);
const signed = (n: number) => `${n >= 0 ? "+" : "-"}${Math.abs(n).toFixed(4)} ETH`;

export function Approvals({ snap, onChange }: { snap: Snapshot; onChange: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reduce = useReducedMotion();
  const pending = snap.approvals.filter((a) => a.status === "pending");
  const recent = snap.approvals.filter((a) => a.status !== "pending").slice(0, 4);
  if (!pending.length && !recent.length) return null;

  /** Throws when the trade did not fill, so the Approve button goes back to idle instead of showing a check. */
  async function decide(id: string, yes: boolean) {
    setBusy(id);
    setError(null);
    try {
      const r = await api.decide(id, yes);
      if (r.status === "failed") throw new Error(r.result?.error ?? "The trade failed.");
    } catch (err) {
      setError((err as Error).message);
      throw err;
    } finally {
      setBusy(null);
      onChange();
    }
  }

  return (
    <section className={s.block} aria-labelledby="approvals-h">
      <h2 id="approvals-h" className={s.blockTitle}>Waiting for you {pending.length ? <span className={s.count}>{pending.length}</span> : null}</h2>
      <AnimatePresence initial={false}>
      {pending.map((a) => (
        <motion.div
          key={a.id}
          className={s.approval}
          layout={!reduce}
          initial={reduce ? false : { opacity: 0, y: -8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0, transition: { duration: 0.25 } }}
          transition={{ duration: 0.3, ease: [0.2, 0.7, 0.2, 1] }}
        >
          <Hoodie member="trader" size={34} mood="working" />
          <div className={s.approvalBody}>
            <p className={s.approvalWhat}>{a.kind === "buy" ? `Buy ${a.eth} ETH of ${a.symbol}` : `Sell all ${a.symbol}`}</p>
            <p className={s.approvalWhy}>{a.reason}</p>
            <div className={s.approvalActions}>
              <a className="btn" href={addressUrl(a.token)} target="_blank" rel="noopener">Token</a>
              <button type="button" className="btn" disabled={busy === a.id} onClick={() => decide(a.id, false).catch(() => {})}>Skip</button>
              <StatusButton className="btn btn-primary" onClick={() => decide(a.id, true)} successLabel="Filled">Approve</StatusButton>
            </div>
          </div>
        </motion.div>
      ))}
      </AnimatePresence>
      {recent.map((a) => (
        <p key={a.id} className={s.recent}>
          <span>{a.kind === "buy" ? "Buy" : "Sell"} {a.symbol}</span>
          {a.status === "done" && a.result?.hash ? <a href={txUrl(a.result.hash)} target="_blank" rel="noopener">filled</a> : <span className={a.status === "failed" ? "down" : "faint"}>{a.status}</span>}
        </p>
      ))}
      <p className={s.error} role="alert">{error}</p>
    </section>
  );
}

export function Wallet({ snap, onChange }: { snap: Snapshot; onChange: () => void }) {
  const [copied, setCopied] = useState(false);
  const [amount, setAmount] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const value = snap.positions.reduce((t, p) => t + (p.valueEth ?? 0), 0);

  async function withdraw(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      const { hash } = await api.withdraw(amount.trim() || "all");
      setMsg(`Sent. ${short(hash)}`);
      setAmount("");
      onChange();
    } catch (err) {
      setMsg((err as Error).message);
    }
  }

  const paper = snap.mode === "paper";
  return (
    <section className={s.block} aria-labelledby="wallet-h">
      <h2 id="wallet-h" className={s.blockTitle}>{paper ? "Paper trading" : "Team wallet"}</h2>
      <Mode snap={snap} onChange={onChange} />
      <div className={s.balances}>
        <div><span className="faint">{paper ? "Paper balance" : "To trade"}</span><strong className="num">{eth(snap.spendableEth)}</strong></div>
        <div><span className="faint">In positions</span><strong className="num">{eth(value)}</strong></div>
      </div>
      {snap.pnl.closedCount || snap.positions.length ? (
        <div className={s.pnl}>
          <span className="faint">Profit and loss</span>
          <span className={`num ${snap.pnl.realizedEth >= 0 ? "up" : "down"}`} title="From closed positions">{signed(snap.pnl.realizedEth)} realized</span>
          <span className={`num ${snap.pnl.unrealizedEth >= 0 ? "up" : "down"}`} title="Open positions at the live sell quote">{signed(snap.pnl.unrealizedEth)} open</span>
        </div>
      ) : null}
      {paper ? (
        <p className="faint" style={{ fontSize: 13, margin: "0 0 4px" }}>
          Trades fill at live prices with practice ETH: nothing is sent and nothing is spent.{" "}
          <button type="button" className={s.linkish} onClick={() => api.resetPaper().then(onChange)}>Reset to 1 ETH</button>
        </p>
      ) : null}
      {paper ? null : (<>
      <div className={s.addressRow}>
        <a className="num" href={addressUrl(snap.wallet)} target="_blank" rel="noopener">{short(snap.wallet)}</a>
        <button
          type="button"
          className="btn"
          onClick={async () => {
            await navigator.clipboard.writeText(snap.wallet).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Copied" : "Copy address"}
        </button>
      </div>
      <p className="faint" style={{ fontSize: 13, margin: "8px 0 0" }}>Send ETH on Robinhood Chain to fund it. It can only pay out to {short(snap.owner)}.</p>
      <form className={s.withdraw} onSubmit={withdraw}>
        <label htmlFor="wd" className="sr-only">Amount to withdraw in ETH</label>
        <input id="wd" className="field num" inputMode="decimal" placeholder="all" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button type="submit" className="btn">Withdraw</button>
      </form>
      {msg ? <p className={s.note} role="status">{msg}</p> : null}
      </>)}
    </section>
  );
}

/** Paper trading, off unless the owner turns it on. Turning it off goes back to the real ETH, so that asks first. */
function Mode({ snap, onChange }: { snap: Snapshot; onChange: () => void }) {
  const [asking, setAsking] = useState(false);
  const paper = snap.mode === "paper";
  const set = (mode: "paper" | "live") => api.mode(mode).then(() => (setAsking(false), onChange()));
  return (
    <div className={s.modeBox}>
      <div className={s.modeRow}>
        <span>
          <strong>Paper trading</strong>
          <span className="faint">Practice with 1 ETH at live prices</span>
        </span>
        <button type="button" role="switch" aria-checked={paper} aria-label="Paper trading" className={s.switch} onClick={() => (paper ? setAsking(true) : set("paper"))}>
          <motion.span layout transition={{ type: "spring", duration: 0.4, bounce: 0.25 }} />
        </button>
      </div>
      <AnimatePresence>
        {asking ? (
          <motion.div className={s.modeAsk} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} role="alertdialog" aria-label="Turn paper trading off">
            <p>With paper trading off, trades use the real ETH in the team wallet: every buy, card and strategy from here on spends it. Your paper book stays as it is.</p>
            <div className={s.approvalActions}>
              <button type="button" className="btn btn-primary" onClick={() => set("live")}>Turn it off</button>
              <button type="button" className="btn" onClick={() => setAsking(false)}>Keep practicing</button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function Positions({ snap, onOpen }: { snap: Snapshot; onOpen?: (pick: { token: string; symbol: string }) => void }) {
  if (!snap.positions.length) return null;
  return (
    <section className={s.block} aria-labelledby="pos-h">
      <h2 id="pos-h" className={s.blockTitle}>Open positions</h2>
      <ul className={s.list}>
        {snap.positions.map((p) => {
          const pnl = p.valueEth === null ? null : (p.valueEth / p.costEth - 1) * 100;
          return (
            <li key={p.id} className={s.item}>
              {onOpen ? <button type="button" className={s.linkish} onClick={() => onOpen({ token: p.token, symbol: p.symbol })}>{p.symbol} →</button> : <a href={addressUrl(p.token)} target="_blank" rel="noopener">{p.symbol}</a>}
              <span className="num faint">{eth(p.costEth)}</span>
              <span className={`num ${pnl === null ? "faint" : pnl >= 0 ? "up" : "down"}`}>{pnl === null ? "–" : `${pnl >= 0 ? "+" : ""}${pnl.toFixed(1)}%`}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function Strategies({ snap, onChange }: { snap: Snapshot; onChange: () => void }) {
  return (
    <section className={s.block} aria-labelledby="str-h">
      <h2 id="str-h" className={s.blockTitle}>Strategies</h2>
      {!snap.strategies.length ? <p className="faint" style={{ fontSize: 14, margin: 0 }}>None yet. Describe one in the chat and SniperBot will set it up.</p> : null}
      {snap.strategies.map((st) => (
        <div key={st.id} className={s.strategy} data-off={!st.active || undefined}>
          <div className={s.strategyHead}>
            <strong>{st.name}</strong>
            <button type="button" className="btn" onClick={() => api.strategy(st.id, { active: !st.active }).then(onChange)}>{st.active ? "Pause" : "Resume"}</button>
          </div>
          <p className="faint" style={{ margin: "2px 0 8px", fontSize: 13 }}>{st.watching}</p>
          <div className={s.rules}><SpecList rows={st.rules} compact /></div>
          <div className={s.seg} role="group" aria-label="When it matches">
            {(["ask", "auto"] as const).map((m) => (
              <button key={m} type="button" aria-pressed={st.mode === m} onClick={() => st.mode !== m && api.strategy(st.id, { mode: m }).then(onChange)}>
                {m === "ask" ? "Ask before each trade" : "Trade automatically"}
              </button>
            ))}
          </div>
          {st.mode === "auto" && !snap.autopilot.on ? <p className="faint" style={{ margin: "6px 0 0", fontSize: 12.5 }}>Asks first until Autopilot is on, in the Team tab.</p> : null}
        </div>
      ))}
    </section>
  );
}

/** Placeholder blocks while the first snapshot loads, shaped like the real panels so nothing jumps. */
export function SideSkeleton() {
  return (
    <div aria-hidden>
      {[132, 196, 240].map((h, i) => (
        <div key={i} className={`${s.block} ${s.skeleton}`} style={{ height: h, animationDelay: `${i * 120}ms` }} />
      ))}
    </div>
  );
}

export function TeamStrip() {
  return (
    <div className={s.strip} aria-hidden="true">
      {(["research", "sniper", "shield", "hoodiebot", "trader", "launch"] as const).map((m) => <Hoodie key={m} member={m} size={m === "hoodiebot" ? 64 : 40} mood="idle" />)}
    </div>
  );
}
