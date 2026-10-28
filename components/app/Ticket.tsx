"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

import { StatusButton } from "@/components/ui/StatusButton";
import { txUrl } from "@/lib/chain/robinhood-urls";
import { price } from "@/lib/format";

import { api, type Quote, type Snapshot, type TokenView } from "./api";
import s from "./app.module.css";

const BUYS = ["0.01", "0.05", "0.1"] as const;
const SHARES = [25, 50, 75, 100] as const;
const SLIPPAGE = [1, 3, 5, 10] as const;

const qty = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : n.toFixed(2));
const ethText = (n: number) => `${n.toFixed(6).replace(/\.?0+$/, "") || "0"} ETH`;
const floor6 = (n: number) => (Math.floor(n * 1e6) / 1e6).toString();

/**
 * The order ticket: buy with ETH or sell a share of the bag, a live quote from the curve or pool (what comes back, the
 * minimum after slippage, the price impact with fees), slippage, and a take profit and stop loss the tick acts on.
 */
export function Ticket({ pick, snap, view, last, side: asked, onDone }: { pick: { token: string; symbol: string } | null; snap: Snapshot; view: TokenView | null; last: number | null; side?: "buy" | "sell"; onDone: () => void }) {
  const [side, setSide] = useState<"buy" | "sell">(asked ?? "buy");
  useEffect(() => void (asked && setSide(asked)), [asked]);
  const [amount, setAmount] = useState("0.01");
  const [pct, setPct] = useState(100);
  const [slip, setSlip] = useState("3");
  const [tp, setTp] = useState("");
  const [sl, setSl] = useState("");
  const [trail, setTrail] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [msg, setMsg] = useState<{ text: string; hash?: string; bad?: boolean } | null>(null);

  const free = snap.spendableEth === null ? null : Number(snap.spendableEth);
  const held = view?.held ?? null;
  const pos = view?.position ?? null;
  const value = pos && last ? pos.tokens * last : null;
  const pnl = pos && value !== null ? (value / pos.costEth - 1) * 100 : null;
  const slipPct = Number(slip);
  const symbol = view?.market?.symbol ?? pick?.symbol ?? "";

  // a new token starts clean, with the exits already set on its position
  useEffect(() => {
    setMsg(null);
    setQuote(null);
    setQuoteError(null);
  }, [pick?.token]);
  useEffect(() => {
    setTp(pos?.takeProfitPct ? String(pos.takeProfitPct) : "");
    setSl(pos?.stopLossPct ? String(pos.stopLossPct) : "");
    setTrail(pos?.trailingStopPct ? String(pos.trailingStopPct) : "");
  }, [pos?.takeProfitPct, pos?.stopLossPct, pos?.trailingStopPct, pick?.token]);

  // the live quote, a moment after the owner stops typing
  useEffect(() => {
    if (!pick) return;
    const eth = Number(amount);
    if (side === "buy" ? !(eth > 0) : !(held && held > 0)) return setQuote(null);
    let live = true;
    setQuoting(true);
    const t = setTimeout(() => {
      api.quote(side === "buy" ? { token: pick.token, side, eth: amount } : { token: pick.token, side, pct })
        .then((q) => live && (setQuote(q), setQuoteError(null)))
        .catch((err: Error) => live && (setQuote(null), setQuoteError(err.message)))
        .finally(() => live && setQuoting(false));
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [pick, side, amount, pct, held]);

  const fill = quote && quote.in > 0 && quote.out > 0 ? (side === "buy" ? quote.in / quote.out : quote.out / quote.in) : null;
  const impact = fill && quote?.spot ? Math.abs(side === "buy" ? fill / quote.spot - 1 : 1 - fill / quote.spot) * 100 : null;
  const min = quote ? quote.out * (1 - slipPct / 100) : null;

  async function go() {
    if (!pick) throw new Error("Pick a token first.");
    setMsg(null);
    try {
      const exits = side === "buy" ? { takeProfitPct: tp || undefined, stopLossPct: sl || undefined, trailingStopPct: trail || undefined } : {};
      const r = await api.trade({ side, token: pick.token, symbol, slippageBps: Math.round(slipPct * 100), ...(side === "buy" ? { eth: amount, ...exits } : { pct }) });
      setMsg({ text: r.pending ? "Sent, waiting for the chain to confirm." : side === "buy" ? "Bought." : "Sold.", hash: r.hash });
      onDone();
    } catch (err) {
      setMsg({ text: (err as Error).message, bad: true });
      throw err;
    }
  }

  async function saveExits() {
    if (!pick) return;
    setMsg(null);
    try {
      await api.exits({ token: pick.token, takeProfitPct: tp || undefined, stopLossPct: sl || undefined, trailingStopPct: trail || undefined });
      setMsg({ text: tp || sl || trail ? "Exits saved. The team checks them every minute." : "Exits cleared." });
      onDone();
    } catch (err) {
      setMsg({ text: (err as Error).message, bad: true });
    }
  }

  return (
    <section className={`${s.block} ${s.ticket}`} aria-label={`Trade ${symbol}`}>
      <div className={s.sides} role="group" aria-label="Side" data-side={side}>
        <button type="button" aria-pressed={side === "buy"} onClick={() => setSide("buy")}>Buy</button>
        <button type="button" aria-pressed={side === "sell"} onClick={() => setSide("sell")}>Sell</button>
      </div>

      {side === "buy" ? (
        <>
          <div className={s.ticketRow}>
            <label htmlFor="buy-eth">You pay</label>
            <button type="button" className={s.balanceBtn} onClick={() => free && setAmount(floor6(free))} disabled={!free}>
              {snap.mode === "paper" ? "Paper" : "Available"} <span className="num">{free === null ? "–" : ethText(free)}</span>
            </button>
          </div>
          <div className={s.amountBox}>
            <input id="buy-eth" className="num" inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value.replace(",", "."))} />
            <span>ETH</span>
          </div>
          <div className={s.presets}>
            {BUYS.map((b) => <button key={b} type="button" className="chip" aria-pressed={amount === b} onClick={() => setAmount(b)}>{b}</button>)}
            {[50].map((p) => <button key={p} type="button" className="chip" disabled={!free} onClick={() => free && setAmount(floor6((free * p) / 100))}>{p}%</button>)}
            <button type="button" className="chip" disabled={!free} onClick={() => free && setAmount(floor6(free))}>Max</button>
          </div>
        </>
      ) : (
        <>
          <div className={s.ticketRow}>
            <label htmlFor="sell-pct">You sell</label>
            <span className="faint">Holding <span className="num">{held === null ? "–" : `${qty(held)} ${symbol}`}</span></span>
          </div>
          <div className={s.amountBox}>
            <output className="num">{held ? qty((held * pct) / 100) : "0"}</output>
            <span>{pct}%</span>
          </div>
          <input id="sell-pct" className={s.range} type="range" min={1} max={100} value={pct} onChange={(e) => setPct(Number(e.target.value))} style={{ ["--fill" as string]: `${pct}%` }} />
          <div className={s.presets}>
            {SHARES.map((p) => <button key={p} type="button" className="chip" aria-pressed={pct === p} onClick={() => setPct(p)}>{p === 100 ? "All" : `${p}%`}</button>)}
          </div>
        </>
      )}

      {quoteError ? <p className={`${s.note} down`} role="alert">{quoteError}</p> : null}
      <dl className={s.quote} aria-live="polite" data-loading={quoting || undefined}>
        <div><dt>You get</dt><dd className="num">{quote ? (side === "buy" ? `${qty(quote.out)} ${symbol}` : ethText(quote.out)) : "–"}</dd></div>
        <div><dt>Minimum, at {slipPct || 0}% slippage</dt><dd className="num">{min !== null ? (side === "buy" ? `${qty(min)} ${symbol}` : ethText(min)) : "–"}</dd></div>
        <div><dt>Fill price</dt><dd className="num">{fill ? `${price(fill)} ETH` : "–"}</dd></div>
        <div><dt>Hoodie fee</dt><dd className="num">{quote?.feePct !== undefined ? `${quote.feePct}%` : "–"}</dd></div>
        <div><dt>Price impact, fees in</dt><dd className={`num ${impact !== null && impact > 10 ? "down" : ""}`}>{impact !== null ? `${impact.toFixed(2)}%` : "–"}</dd></div>
      </dl>

      <div className={s.ticketRow}>
        <span>Slippage</span>
        <div className={s.slip}>
          {SLIPPAGE.map((p) => <button key={p} type="button" aria-pressed={slip === String(p)} onClick={() => setSlip(String(p))}>{p}%</button>)}
          <label className="sr-only" htmlFor="slip">Custom slippage in percent</label>
          <input id="slip" className="num" inputMode="decimal" value={SLIPPAGE.some((p) => String(p) === slip) ? "" : slip} placeholder="custom" onChange={(e) => setSlip(e.target.value.replace(",", ".") || "3")} />
        </div>
      </div>

      <fieldset className={s.exits}>
        <legend>Exit automatically</legend>
        <label>
          <span>Take profit</span>
          <span className={s.exitField}><span className="up">+</span><input className="num" inputMode="decimal" placeholder="80" value={tp} onChange={(e) => setTp(e.target.value.replace(/[^\d.]/g, ""))} /><span>%</span></span>
        </label>
        <label>
          <span>Stop loss</span>
          <span className={s.exitField}><span className="down">-</span><input className="num" inputMode="decimal" placeholder="35" value={sl} onChange={(e) => setSl(e.target.value.replace(/[^\d.]/g, ""))} /><span>%</span></span>
        </label>
        <label>
          <span>Trailing</span>
          <span className={s.exitField}><span className="down">-</span><input className="num" inputMode="decimal" placeholder="25" value={trail} onChange={(e) => setTrail(e.target.value.replace(/[^\d.]/g, ""))} /><span>%</span></span>
        </label>
        {pos?.hand ? <button type="button" className={`btn ${s.saveExits}`} onClick={saveExits}>Save on position</button> : null}
      </fieldset>

      <StatusButton className={`btn ${s.go}`} data-side={side} onClick={go} successLabel={side === "buy" ? "Bought" : "Sold"}>
        {side === "buy" ? `Buy ${symbol}` : `Sell ${pct === 100 ? "all" : `${pct}%`} ${symbol}`}{snap.mode === "paper" ? " on paper" : ""}
      </StatusButton>

      <AnimatePresence mode="wait">
        {msg ? (
          <motion.p key={msg.text} className={s.note} role="status" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <span className={msg.bad ? "down" : undefined}>{msg.text}</span> {msg.hash ? <a href={txUrl(msg.hash)} target="_blank" rel="noopener">View</a> : null}
          </motion.p>
        ) : null}
      </AnimatePresence>

      {pos ? (
        <div className={s.posLine}>
          <span className="faint">Position</span>
          <span className="num">{value !== null ? ethText(value) : "–"}</span>
          <span className={`num ${pnl === null ? "faint" : pnl >= 0 ? "up" : "down"}`}>{pnl === null ? "" : `${pnl >= 0 ? "+" : ""}${pnl.toFixed(1)}%`}</span>
          <span className="num faint">cost {ethText(pos.costEth)}</span>
        </div>
      ) : null}
    </section>
  );
}
