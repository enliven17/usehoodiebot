"use client";

import { useState } from "react";
import { Hoodie } from "@/components/Hoodie";
import { ago } from "@/lib/format";
import { TEAM, MEMBERS } from "@/lib/team";
import { txUrl } from "@/lib/chain/robinhood-urls";
import type { Snapshot } from "./api";
import { Approvals, Positions } from "./Side";
import { Timeline } from "./Timeline";
import s from "./app.module.css";

export type TokenPick = { token: string; symbol: string };

export function Activity({ snap, onChange, onOpen }: { snap: Snapshot; onChange: () => void; onOpen: (pick: TokenPick) => void }) {
  const [filter, setFilter] = useState("all");
  const pending = snap.approvals.filter((a) => a.status === "pending").length;
  const events = snap.events.filter((e) => filter === "all" || (filter === "trades" ? e.kind === "buy" || e.kind === "sell" : e.member === filter));
  return (
    <div className={s.activity}>
      <header className={s.activityHead}>
        <div><p className={s.eyebrow}>{snap.mode === "paper" ? "Paper trading" : "Live trading"} · Robinhood Chain</p><h1>Your team, in motion.</h1><p className="faint">Follow decisions, review trades and open any position on the chart.</p></div>
        <span className={s.liveStatus}>Updates every 8s</span>
      </header>
      <dl className={s.overview}>
        <div><dt>Available to trade</dt><dd className="num">{snap.spendableEth === null ? "Unavailable" : `${Number(snap.spendableEth).toFixed(4)} ETH`}</dd></div>
        <div><dt>Open positions</dt><dd className="num">{snap.positions.length}</dd></div>
        <div><dt>Realized P&L</dt><dd className={`num ${snap.pnl.realizedEth >= 0 ? "up" : "down"}`}>{snap.pnl.realizedEth >= 0 ? "+" : ""}{snap.pnl.realizedEth.toFixed(4)} ETH</dd></div>
        <div><dt>Waiting for you</dt><dd className="num">{pending}</dd></div>
      </dl>
      <div className={s.agentCards}>
        {MEMBERS.map((member) => {
          const agent = TEAM[member];
          const last = snap.agents[member]?.last;
          return <article key={member} className={s.agentCard} style={{ ["--eye" as string]: agent.eyes }}>
            <div><Hoodie member={member} size={36} mood="idle" /><strong>{agent.name}</strong></div>
            <p>{last?.text ?? "Ready when you need me."}</p>
            <time className="faint">{last ? ago(last.at) : "No activity yet"}</time>
          </article>;
        })}
      </div>
      <Approvals snap={snap} onChange={onChange} />
      <div className={s.activityGrid}>
        <section className={s.activityFeed} aria-label="Team activity">
          <div className={s.marketFilters} role="group" aria-label="Activity filter">
            {[["all", "All activity"], ["trades", "Trades"], ["shield", "Safety"], ["research", "Research"], ["sniper", "Strategies"]].map(([key, label]) => <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key!)}>{label}</button>)}
          </div>
          <Timeline snap={{ ...snap, events }} onOpen={onOpen} />
        </section>
        <div>
          <Positions snap={snap} onOpen={onOpen} />
          <section className={s.block} aria-label="Recent trades">
            <h2 className={s.blockTitle}>Recent trades</h2>
            {!snap.trades.length ? <p className="faint">Your completed trades will appear here.</p> : <ul className={s.list}>{snap.trades.slice(0, 15).map((trade) => <li key={trade.hash} className={s.activityTrade}>
              <span className={trade.side === "buy" ? "up" : "down"}>{trade.side === "buy" ? "Buy" : "Sell"}</span><strong>{trade.symbol}</strong><span className="num">{Number(trade.eth).toFixed(4)} ETH</span>
              {txUrl(trade.hash) ? <a href={txUrl(trade.hash)} target="_blank" rel="noopener">{ago(trade.at)}</a> : <span className="faint">Paper · {ago(trade.at)}</span>}
            </li>)}</ul>}
          </section>
        </div>
      </div>
    </div>
  );
}
