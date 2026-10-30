"use client";

import { useState } from "react";

import { Hoodie } from "@/components/Hoodie";
import { txUrl } from "@/lib/chain/robinhood-urls";
import { ago } from "@/lib/format";
import { MEMBERS, TEAM } from "@/lib/team";

import type { Snapshot } from "./api";
import { Approvals } from "./Side";
import { Timeline } from "./Timeline";
import s from "./app.module.css";

export type TokenPick = { token: string; symbol: string };

const FILTERS = [["all", "All"], ["trades", "Trades"], ["research", "Research"], ["shield", "Safety"], ["sniper", "Strategies"]] as const;
const eth = (amount: number) => `${amount.toFixed(4)} ETH`;
const signed = (amount: number) => `${amount >= 0 ? "+" : ""}${eth(amount)}`;

export function Activity({ snap, onChange, onOpen }: { snap: Snapshot; onChange: () => void; onOpen: (pick: TokenPick) => void }) {
  const [filter, setFilter] = useState<string>("all");
  const pending = snap.approvals.filter((a) => a.status === "pending").length;
  const events = snap.events.filter((e) => filter === "all" || e.member === filter);

  return (
    <div className={s.activity}>
      <div className={s.activityInner}>
        <header className={s.activityHead}>
          <h1>Activity</h1>
          <span>{snap.mode === "paper" ? "Paper account" : "Live account"}</span>
        </header>

        <dl className={s.activityBalance}>
          <div><dt>Available</dt><dd className="num">{snap.spendableEth === null ? "Unavailable" : eth(Number(snap.spendableEth))}</dd></div>
          <div><dt>Open P&L</dt><dd className={`num ${snap.pnl.unrealizedEth >= 0 ? "up" : "down"}`}>{signed(snap.pnl.unrealizedEth)}</dd></div>
          <div><dt>Realized P&L</dt><dd className={`num ${snap.pnl.realizedEth >= 0 ? "up" : "down"}`}>{signed(snap.pnl.realizedEth)}</dd></div>
        </dl>

        {pending > 0 ? <Approvals snap={snap} onChange={onChange} /> : null}

        <div className={s.activityLayout}>
          <section className={s.activityFeed} aria-label="Team activity">
            <div className={s.activityTabs} role="group" aria-label="Activity filter">
              {FILTERS.map(([key, label]) => <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}
            </div>
            {filter === "trades" ? (
              !snap.trades.length ? <p className={s.activityEmpty}>No trades yet.</p> : (
                <table className={s.activityTrades}>
                  <caption className="sr-only">Completed trades</caption>
                  <thead><tr><th scope="col">Trade</th><th scope="col">Amount</th><th scope="col">Time</th></tr></thead>
                  <tbody>{snap.trades.map((trade) => {
                    const event = snap.events.find((e) => e.hash === trade.hash && e.token);
                    const url = txUrl(trade.hash);
                    return <tr key={trade.hash}>
                      <td><div className={s.activityTradeName}><span className={trade.side === "buy" ? "up" : "down"}>{trade.side === "buy" ? "Buy" : "Sell"}</span>{event?.token ? <button type="button" onClick={() => onOpen({ token: event.token!, symbol: trade.symbol })}>{trade.symbol}</button> : <strong>{trade.symbol}</strong>}</div>{!url ? <span className={s.activityTradeMode}>Paper</span> : null}</td>
                      <td className="num">{eth(Number(trade.eth))}</td>
                      <td>{url ? <a href={url} target="_blank" rel="noopener">{ago(trade.at)} ↗</a> : <time dateTime={new Date(trade.at).toISOString()}>{ago(trade.at)}</time>}</td>
                    </tr>;
                  })}</tbody>
                </table>
              )
            ) : <Timeline snap={{ ...snap, events }} onOpen={onOpen} plain emptyText={filter === "all" ? "No activity yet." : "No activity in this category yet."} />}
          </section>

          <section className={s.activityPositions} aria-labelledby="activity-positions">
            <h2 id="activity-positions">Positions <span>{snap.positions.length}</span></h2>
            {!snap.positions.length ? <p className={s.activityEmpty}>No open positions.</p> : <ul>
              {snap.positions.map((position) => {
                const pnl = position.valueEth !== null && position.costEth > 0 ? (position.valueEth / position.costEth - 1) * 100 : null;
                return <li key={position.id}>
                  <button type="button" className={s.activityPosition} onClick={() => onOpen({ token: position.token, symbol: position.symbol })}>
                    <strong>{position.symbol}</strong><span className="num">{position.valueEth === null ? "—" : eth(position.valueEth)}</span>
                    <span className={s.activityCost}>Cost {eth(position.costEth)}</span><span className={`num ${pnl === null ? "faint" : pnl >= 0 ? "up" : "down"}`}>{pnl === null ? "Unpriced" : `${pnl >= 0 ? "+" : ""}${pnl.toFixed(1)}%`}</span>
                  </button>
                </li>;
              })}
            </ul>}
          </section>

          <section className={s.activityTeam} aria-labelledby="activity-team">
            <h2 id="activity-team">Team</h2>
            {MEMBERS.map((member) => {
              const last = snap.agents[member]?.last;
              return <details key={member} className={s.activityAgent}>
                <summary><Hoodie member={member} size={24} mood="idle" /><span>{TEAM[member].name}</span><time>{last ? ago(last.at) : "No activity"}</time><span className={s.activityChevron} aria-hidden>›</span></summary>
                <p>{last?.text ?? "No activity yet."}</p>
              </details>;
            })}
          </section>
        </div>
      </div>
    </div>
  );
}
