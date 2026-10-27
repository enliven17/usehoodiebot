"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getAddress, isAddress } from "viem";

import { StatusButton } from "@/components/ui/StatusButton";
import { addressUrl, txUrl } from "@/lib/chain/robinhood-urls";
import { ago, price, usd } from "@/lib/format";
import { TEAM, type Member } from "@/lib/team";

import { api, type MarketToken, type Snapshot, type TokenView } from "./api";
import s from "./app.module.css";
import { Chart } from "./Chart";

const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
const BUYS = ["0.005", "0.01", "0.05"] as const;
const SELLS = [25, 50, 100] as const;
/** GeckoTerminal is shared by every owner (about 30 calls a minute); the server caches candles for 30 s. */
const CHART_POLL_MS = 20_000;
const LIST_POLL_MS = 60_000;

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const ethText = (n: number) => `${n.toFixed(4).replace(/\.?0+$/, "")} ETH`;

/** A full trade screen: tokens, the chart with every buy and sell the team made, the position, and buy and sell by hand. */
export function Trade({ snap, onChange }: { snap: Snapshot; onChange: () => void }) {
  const [tokens, setTokens] = useState<MarketToken[] | null>(null);
  const [pick, setPick] = useState<{ token: string; symbol: string } | null>(null);
  const [tf, setTf] = useState<(typeof TIMEFRAMES)[number]>("5m");
  const [view, setView] = useState<TokenView | null>(null);
  const [find, setFind] = useState("");

  const loadList = useCallback(() => api.market().then((r) => setTokens(r.tokens)).catch(() => setTokens((t) => t ?? [])), []);
  useEffect(() => {
    void loadList();
    const t = setInterval(() => !document.hidden && loadList(), LIST_POLL_MS);
    return () => clearInterval(t);
  }, [loadList]);

  // first visit: the first token the team holds, else the busiest on Pons
  useEffect(() => {
    if (!pick && tokens?.length) setPick({ token: tokens[0]!.token, symbol: tokens[0]!.symbol });
  }, [tokens, pick]);

  const loadView = useCallback(async () => {
    if (!pick) return;
    try {
      const v = await api.token(pick.token, tf);
      setView((old) => (old && v.candles.length === 0 && old.candles.length && old.market?.token === pick.token ? { ...v, candles: old.candles } : v));
    } catch {
      /* the next poll tries again */
    }
  }, [pick, tf]);
  useEffect(() => {
    setView(null);
    void loadView();
    const t = setInterval(() => !document.hidden && loadView(), CHART_POLL_MS);
    return () => clearInterval(t);
  }, [loadView]);

  const shown = useMemo(() => {
    const q = find.trim().toLowerCase();
    if (!tokens) return [];
    return q ? tokens.filter((t) => t.symbol.toLowerCase().includes(q) || t.token.toLowerCase() === q) : tokens;
  }, [tokens, find]);
  const pasted = isAddress(find.trim()) && !shown.length ? getAddress(find.trim()) : null;

  const last = view?.candles.at(-1)?.close ?? view?.market?.priceEth ?? null;
  const first = view?.candles[0]?.open ?? null;
  const change = last && first ? (last / first - 1) * 100 : null;
  const pos = view?.position ?? null;
  const entry = pos && pos.tokens > 0 ? pos.costEth / pos.tokens : null;
  const value = pos && last ? pos.tokens * last : null;
  const decisions = pick ? snap.events.filter((e) => e.token === pick.token).slice(0, 8) : [];

  return (
    <div className={s.trade}>
      <aside className={s.tokens} aria-label="Tokens">
        <label htmlFor="find" className="sr-only">Find a token</label>
        <input id="find" className="field" placeholder="Symbol or address" value={find} onChange={(e) => setFind(e.target.value)} autoComplete="off" spellCheck={false} />
        <ul className={s.tokenList}>
          {tokens === null ? [0, 1, 2, 3, 4].map((i) => <li key={i} className={`${s.tokenRow} ${s.skeleton}`} style={{ height: 46, animationDelay: `${i * 90}ms` }} aria-hidden />) : null}
          {pasted ? (
            <li>
              <button type="button" className={s.tokenRow} onClick={() => { setPick({ token: pasted, symbol: short(pasted) }); setFind(""); }}>
                <span className={s.tokenSym}>{short(pasted)}</span>
                <span className="faint">Open</span>
              </button>
            </li>
          ) : null}
          {shown.map((t, i) => (
            <li key={t.token} data-split={i > 0 && t.group === "market" && shown[i - 1]!.group !== "market" ? "" : undefined}>
              <button type="button" className={s.tokenRow} aria-current={pick?.token === t.token ? "true" : undefined} onClick={() => setPick({ token: t.token, symbol: t.symbol })}>
                <span className={s.tokenSym}>{t.symbol}</span>
                <span className="num faint">{t.group === "held" ? "In wallet" : usd(t.mcapUsd)}</span>
                <span className={s.tokenSub}>{t.venue === "graduated" ? "Uniswap" : t.curvePct !== undefined ? `Curve ${t.curvePct.toFixed(0)}%` : t.group === "traded" ? "Traded" : "Pons"}</span>
                <span className={`num ${s.tokenSub}`}>{t.volume1hUsd !== undefined ? `${usd(t.volume1hUsd)} 1h` : ""}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className={s.desk} aria-label={pick ? `${pick.symbol} chart` : "Chart"}>
        <header className={s.deskHead}>
          <div className={s.deskName}>
            <h1>{view?.market?.symbol ?? pick?.symbol ?? "Pick a token"}</h1>
            {pick ? <a className="num" href={addressUrl(pick.token)} target="_blank" rel="noopener">{short(pick.token)}</a> : null}
          </div>
          <div className={s.deskPrice}>
            <strong className="num">{last ? `${price(last)} ETH` : "–"}</strong>
            {change !== null ? <span className={`num ${change >= 0 ? "up" : "down"}`}>{change >= 0 ? "+" : ""}{change.toFixed(1)}%</span> : null}
          </div>
          <dl className={s.stats}>
            <div><dt>Market cap</dt><dd className="num">{usd(view?.market?.mcapUsd)}</dd></div>
            <div><dt>Liquidity</dt><dd className="num">{usd(view?.market?.liquidityUsd)}</dd></div>
            <div><dt>Volume 1h</dt><dd className="num">{usd(view?.market?.volume1hUsd)}</dd></div>
            <div><dt>Buys / sells 1h</dt><dd className="num">{view?.market ? `${view.market.buys1h ?? 0} / ${view.market.sells1h ?? 0}` : "–"}</dd></div>
            <div><dt>{view?.market?.venue === "graduated" ? "Venue" : "Curve"}</dt><dd className="num">{view?.market?.venue === "graduated" ? "Uniswap v4" : view?.market?.curvePct !== undefined ? `${view.market.curvePct.toFixed(0)}%` : "–"}</dd></div>
          </dl>
        </header>

        <div className={s.chartWrap}>
          <div className={s.seg} role="group" aria-label="Candle size">
            {TIMEFRAMES.map((t) => <button key={t} type="button" aria-pressed={tf === t} onClick={() => setTf(t)}>{t}</button>)}
          </div>
          <Chart candles={view?.candles ?? []} fills={view?.trades ?? []} entry={entry} fitKey={`${pick?.token}-${tf}`} />
          <AnimatePresence>
            {!view || !view.candles.length ? (
              <motion.p key="state" className={s.chartState} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {!view ? "Loading candles…" : "No trades in this window yet."}
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>

        <div className={s.deskGrid}>
          <TradeBox pick={pick} snap={snap} pos={pos} value={value} entry={entry} onDone={() => { void loadView(); onChange(); }} />
          <section className={s.block} aria-labelledby="fills-h">
            <h2 id="fills-h" className={s.blockTitle}>Team trades in {pick?.symbol ?? "this token"}</h2>
            {!view?.trades.length ? (
              <p className="faint" style={{ fontSize: 14, margin: 0 }}>None yet. Every buy and sell lands here and on the chart.</p>
            ) : (
              <ul className={s.list}>
                {[...view.trades].reverse().map((f) => (
                  <li key={f.hash} className={s.fill}>
                    <span className={f.side === "buy" ? "up" : "down"}>{f.side === "buy" ? "Buy" : "Sell"}</span>
                    <span className="num">{ethText(f.eth)}</span>
                    <span className="num faint">@ {f.tokens ? price(f.eth / f.tokens) : "–"}</span>
                    <a className="num" href={txUrl(f.hash)} target="_blank" rel="noopener">{ago(f.at)}</a>
                  </li>
                ))}
              </ul>
            )}
            {decisions.length ? (
              <>
                <h3 className={s.subTitle}>Why</h3>
                <ul className={s.list}>
                  {decisions.map((e) => (
                    <li key={e.id} className={s.why} style={{ ["--eye" as string]: TEAM[e.member as Member]?.eyes ?? TEAM.hoodiebot.eyes }}>
                      <span><strong>{TEAM[e.member as Member]?.name ?? "HOODIEBOT"}</strong> {e.text}</span>
                      <time className="num faint">{ago(e.at)}</time>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>
        </div>
      </section>
    </div>
  );
}

function TradeBox({ pick, snap, pos, value, entry, onDone }: { pick: { token: string; symbol: string } | null; snap: Snapshot; pos: TokenView["position"]; value: number | null; entry: number | null; onDone: () => void }) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("0.01");
  const [pct, setPct] = useState<number>(100);
  const [msg, setMsg] = useState<{ text: string; hash?: string; bad?: boolean } | null>(null);
  const pnl = pos && value !== null ? (value / pos.costEth - 1) * 100 : null;

  useEffect(() => setMsg(null), [pick?.token]);

  async function go() {
    if (!pick) throw new Error("Pick a token first.");
    setMsg(null);
    try {
      const r = await api.trade(side === "buy" ? { side, token: pick.token, symbol: pick.symbol, eth: amount } : { side, token: pick.token, symbol: pick.symbol, pct });
      setMsg({ text: r.pending ? "Sent, waiting for the chain to confirm." : side === "buy" ? "Bought." : "Sold.", hash: r.hash });
      onDone();
    } catch (err) {
      setMsg({ text: (err as Error).message, bad: true });
      throw err;
    }
  }

  return (
    <section className={s.block} aria-labelledby="tb-h">
      <h2 id="tb-h" className="sr-only">Trade {pick?.symbol}</h2>
      {pos ? (
        <div className={s.balances}>
          <div><span className="faint">Position</span><strong className="num">{value !== null ? ethText(value) : "–"}</strong></div>
          <div><span className="faint">Cost {entry ? `@ ${price(entry)}` : ""}</span><strong className={`num ${pnl === null ? "" : pnl >= 0 ? "up" : "down"}`}>{ethText(pos.costEth)}{pnl !== null ? ` ${pnl >= 0 ? "+" : ""}${pnl.toFixed(1)}%` : ""}</strong></div>
        </div>
      ) : null}
      <div className={s.seg} role="group" aria-label="Side" style={{ marginBottom: 12 }}>
        <button type="button" aria-pressed={side === "buy"} onClick={() => setSide("buy")}>Buy</button>
        <button type="button" aria-pressed={side === "sell"} onClick={() => setSide("sell")}>Sell</button>
      </div>
      {side === "buy" ? (
        <>
          <label htmlFor="buy-eth" className="sr-only">ETH to spend</label>
          <div className={s.amount}>
            <input id="buy-eth" className="field num" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <span className="faint">ETH</span>
          </div>
          <div className={s.presets}>
            {BUYS.map((b) => <button key={b} type="button" className="chip" aria-pressed={amount === b} onClick={() => setAmount(b)}>{b}</button>)}
          </div>
        </>
      ) : (
        <div className={s.presets}>
          {SELLS.map((p) => <button key={p} type="button" className="chip" aria-pressed={pct === p} onClick={() => setPct(p)}>{p === 100 ? "All" : `${p}%`}</button>)}
        </div>
      )}
      <StatusButton className={`btn btn-primary ${s.go}`} onClick={go} successLabel={side === "buy" ? "Bought" : "Sold"}>
        {side === "buy" ? `Buy ${pick?.symbol ?? ""}` : `Sell ${pct === 100 ? "all" : `${pct}%`}`}
      </StatusButton>
      <p className={s.note}>
        {msg ? (
          <span className={msg.bad ? "down" : undefined} role="status">{msg.text} {msg.hash ? <a href={txUrl(msg.hash)} target="_blank" rel="noopener">View</a> : null}</span>
        ) : (
          <span className="faint">From the team wallet ({snap.spendableEth === null ? "–" : ethText(Number(snap.spendableEth))} free), up to 3% slippage.</span>
        )}
      </p>
    </section>
  );
}
