"use client";

import { useState } from "react";

import { Hoodie } from "@/components/Hoodie";
import { addressUrl, txUrl } from "@/lib/chain/robinhood-urls";

import { api, type Snapshot } from "./api";
import s from "./app.module.css";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const eth = (n: number | string | null, d = 4) => (n === null ? "–" : `${Number(n).toFixed(d)} ETH`);

export function Approvals({ snap, onChange }: { snap: Snapshot; onChange: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = snap.approvals.filter((a) => a.status === "pending");
  const recent = snap.approvals.filter((a) => a.status !== "pending").slice(0, 4);
  if (!pending.length && !recent.length) return null;

  async function decide(id: string, yes: boolean) {
    setBusy(id);
    setError(null);
    try {
      const r = await api.decide(id, yes);
      if (r.status === "failed") setError(r.result?.error ?? "The trade failed.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
      onChange();
    }
  }

  return (
    <section className={s.block} aria-labelledby="approvals-h">
      <h2 id="approvals-h" className={s.blockTitle}>Waiting for you {pending.length ? <span className={s.count}>{pending.length}</span> : null}</h2>
      {pending.map((a) => (
        <div key={a.id} className={s.approval}>
          <Hoodie member="trader" size={34} mood="working" />
          <div className={s.approvalBody}>
            <p className={s.approvalWhat}>{a.kind === "buy" ? `Buy ${a.eth} ETH of ${a.symbol}` : `Sell all ${a.symbol}`}</p>
            <p className={s.approvalWhy}>{a.reason}</p>
            <div className={s.approvalActions}>
              <a className="btn" href={addressUrl(a.token)} target="_blank" rel="noopener">Token</a>
              <button type="button" className="btn" disabled={busy === a.id} onClick={() => decide(a.id, false)}>Skip</button>
              <button type="button" className="btn btn-primary" disabled={busy === a.id} onClick={() => decide(a.id, true)}>
                {busy === a.id ? "Trading…" : "Approve"}
              </button>
            </div>
          </div>
        </div>
      ))}
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

  return (
    <section className={s.block} aria-labelledby="wallet-h">
      <h2 id="wallet-h" className={s.blockTitle}>Team wallet</h2>
      <div className={s.balances}>
        <div><span className="faint">To trade</span><strong className="num">{eth(snap.spendableEth)}</strong></div>
        <div><span className="faint">In positions</span><strong className="num">{eth(value)}</strong></div>
      </div>
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
    </section>
  );
}

export function Positions({ snap }: { snap: Snapshot }) {
  if (!snap.positions.length) return null;
  return (
    <section className={s.block} aria-labelledby="pos-h">
      <h2 id="pos-h" className={s.blockTitle}>Open positions</h2>
      <ul className={s.list}>
        {snap.positions.map((p) => {
          const pnl = p.valueEth === null ? null : (p.valueEth / p.costEth - 1) * 100;
          return (
            <li key={p.id} className={s.item}>
              <a href={addressUrl(p.token)} target="_blank" rel="noopener">{p.symbol}</a>
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
          <div className={s.pills}>{st.rules.map((r) => <span key={r} className={s.pill}>{r}</span>)}</div>
          <div className={s.seg} role="group" aria-label="When it matches">
            {(["ask", "auto"] as const).map((m) => (
              <button key={m} type="button" aria-pressed={st.mode === m} onClick={() => st.mode !== m && api.strategy(st.id, { mode: m }).then(onChange)}>
                {m === "ask" ? "Ask before each trade" : "Trade automatically"}
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

export function Activity({ snap }: { snap: Snapshot }) {
  if (!snap.trades.length) return null;
  return (
    <section className={s.block} aria-labelledby="act-h">
      <h2 id="act-h" className={s.blockTitle}>Activity</h2>
      <ul className={s.list}>
        {snap.trades.map((t) => (
          <li key={t.hash + t.side} className={s.item}>
            <span>{t.side === "buy" ? "Bought" : "Sold"} {t.symbol}</span>
            <span className="num faint">{eth(t.eth)}</span>
            <a className="num" href={txUrl(t.hash)} target="_blank" rel="noopener">{short(t.hash)}</a>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function TeamStrip() {
  return (
    <div className={s.strip} aria-hidden="true">
      {(["research", "sniper", "hoodiebot", "trader", "launch"] as const).map((m) => <Hoodie key={m} member={m} size={m === "hoodiebot" ? 64 : 44} mood="idle" />)}
    </div>
  );
}
