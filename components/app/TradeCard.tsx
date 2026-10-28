"use client";

import { useState } from "react";

import { StatusButton } from "@/components/ui/StatusButton";
import { addressUrl, txUrl } from "@/lib/chain/robinhood-urls";
import { price, usd } from "@/lib/format";
import type { TradeCard as Card } from "@/lib/lines";

import { api } from "./api";
import s from "./app.module.css";

/** A card older than this asks to be laid out again: the market has moved. */
const FRESH_MS = 10 * 60_000;

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const qty = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : n.toFixed(2));
const ethText = (n: number) => `${n.toFixed(6).replace(/\.?0+$/, "")} ETH`;

/** The trade the owner asked for in chat, laid out to confirm with one press. It fills once. */
export function TradeCard({ card, onDone }: { card: Card; onDone: () => void }) {
  const [hash, setHash] = useState(card.done && card.done !== "pending" ? card.done : null);
  const [error, setError] = useState<string | null>(null);
  const buy = card.side === "buy";
  const stale = Date.now() - card.at > FRESH_MS;
  const blocked = !!card.safety?.blocked;

  async function go() {
    setError(null);
    try {
      const r = await api.trade({ side: card.side, token: card.token, symbol: card.symbol, slippageBps: 300, cardId: card.id, ...(buy ? { eth: String(card.ethAmount) } : { pct: card.pct ?? 100 }) });
      setHash(r.hash);
      onDone();
    } catch (err) {
      setError((err as Error).message);
      throw err;
    }
  }

  return (
    <div className={s.tradeCard} data-side={card.side}>
      <div className={s.tcHead}>
        <span className={s.tcSide}>{buy ? "Buy" : "Sell"}</span>
        <strong className={s.tcSym}>${card.symbol}</strong>
        <a className="num faint" href={addressUrl(card.token)} target="_blank" rel="noopener">{short(card.token)}</a>
        <span className="faint">{card.venue === "graduated" ? "Uniswap" : card.venue === "curve" ? "Pons curve" : ""}</span>
      </div>
      <dl className={s.tcFacts}>
        <div><dt>Price</dt><dd className="num">{card.priceEth ? `${price(card.priceEth)} ETH` : "–"}</dd></div>
        <div><dt>Market cap</dt><dd className="num">{usd(card.mcapUsd)}</dd></div>
        <div><dt>{buy ? "You pay" : "You sell"}</dt><dd className="num">{buy ? ethText(card.ethAmount ?? 0) : `${card.pct}% · ${qty(((card.held ?? 0) * (card.pct ?? 100)) / 100)}`}</dd></div>
        <div><dt>You get, about</dt><dd className="num">{card.out === null ? "–" : buy ? `${qty(card.out)} ${card.symbol}` : ethText(card.out)}</dd></div>
      </dl>
      {card.safety ? (
        <p className={s.tcSafety} data-blocked={blocked || undefined}>
          <span className="num">ShieldBot {blocked ? "blocked" : card.safety.score < 0 ? "unchecked" : `${card.safety.score}/100`}</span> {card.safety.note}
        </p>
      ) : null}
      {hash ? (
        <p className={s.tcDone}><span className="up">{buy ? "Bought" : "Sold"}{card.paper ? " on paper" : ""}.</span> {txUrl(hash) ? <a href={txUrl(hash)} target="_blank" rel="noopener">View transaction</a> : null}</p>
      ) : (
        <div className={s.tcActions}>
          <StatusButton className={`btn ${s.go}`} data-side={card.side} disabled={blocked || stale} onClick={go} successLabel={buy ? "Bought" : "Sold"}>
            {blocked ? "Blocked by ShieldBot" : stale ? "Ask again, the price has moved" : `${buy ? "Buy" : "Sell"} ${card.symbol}${card.paper ? " on paper" : ""}`}
          </StatusButton>
          <span className="faint">{card.paper ? "Practice ETH at the live price: nothing is spent." : "Includes Hoodie's 0.5% fee, up to 3% slippage."}</span>
        </div>
      )}
      {error ? <p className={s.error} role="alert">{error}</p> : null}
    </div>
  );
}
