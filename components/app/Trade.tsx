"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAddress, isAddress } from "viem";

import { candles as loadCandles, type Candle, type Timeframe } from "@/lib/chain/market";
import { addressUrl, txUrl } from "@/lib/chain/robinhood-urls";
import { ago, price, usd } from "@/lib/format";
import { TEAM, type Member } from "@/lib/team";

import { api, type MarketToken, type Snapshot, type TokenView } from "./api";
import s from "./app.module.css";
import { Chart } from "./Chart";
import { Ticket } from "./Ticket";

const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"] as const satisfies readonly Timeframe[];
/** Candles come from GeckoTerminal in the browser, so each owner has their own rate limit (about 30 calls a minute). */
const CANDLE_POLL_MS = 15_000;
const VIEW_POLL_MS = 20_000;
const LIST_POLL_MS = 60_000;

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const ethText = (n: number) => `${n.toFixed(4).replace(/\.?0+$/, "")} ETH`;

/** A full trade screen: tokens, the chart with every buy and sell the team made, the position, and buy and sell by hand. */
export function Trade({ snap, onChange, initialPick }: { snap: Snapshot; onChange: () => void; initialPick?: { token: string; symbol: string } | null }) {
  const [tokens, setTokens] = useState<MarketToken[] | null>(null);
  const [pick, setPick] = useState<{ token: string; symbol: string; pool?: string } | null>(initialPick ?? null);
  const [tf, setTf] = useState<Timeframe>("5m");
  const [viewState, setView] = useState<{ token: string; data: TokenView } | null>(null);
  const [viewError, setViewError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [listError, setListError] = useState(false);
  const [page, setPage] = useState(1);
  const pageRef = useRef(page);
  pageRef.current = page;
  const [hasMore, setHasMore] = useState(true);
  const [moreBusy, setMoreBusy] = useState(false);
  const [search, setSearch] = useState<{ q: string; tokens: MarketToken[]; error?: boolean } | null>(null);
  const [filter, setFilter] = useState("all");
  const [bars, setBars] = useState<{ key: string; list: Candle[] } | null>(null);
  const [barsError, setBarsError] = useState(false);
  const [find, setFind] = useState("");
  // phones: the order ticket is a sheet that slides up from the Buy and Sell bar
  const [sheet, setSheet] = useState<"buy" | "sell" | null>(null);
  useEffect(() => {
    if (!sheet) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setSheet(null);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [sheet]);
  // what was last seen per token, so going back to one shows it at once while it refreshes
  const views = useRef(new Map<string, TokenView>());

  const loadList = useCallback(() => api.market().then((r) => {
    setTokens((old) => [...r.tokens, ...(old ?? []).filter((t) => !r.tokens.some((n) => n.token.toLowerCase() === t.token.toLowerCase()))]);
    setListError(!!r.unavailable);
    setHasMore((old) => pageRef.current === 1 ? r.hasMore : old);
  }).catch(() => setListError(true)), []);
  const query = find.trim().toLowerCase();
  useEffect(() => {
    if (query.length < 2 || isAddress(query)) return;
    let live = true;
    const timer = setTimeout(() => {
      api.market(query).then((r) => live && setSearch({ q: query, tokens: r.tokens }))
        .catch(() => live && setSearch({ q: query, tokens: [], error: true }));
    }, 450);
    return () => { live = false; clearTimeout(timer); };
  }, [query]);
  const loadMore = async () => {
    setMoreBusy(true);
    try {
      const r = await api.market("", page + 1);
      setTokens((old) => [...(old ?? []), ...r.tokens.filter((t) => !(old ?? []).some((n) => n.token.toLowerCase() === t.token.toLowerCase()))]);
      setPage(page + 1); setHasMore(r.hasMore); setListError(false);
    } catch { setListError(true); }
    finally { setMoreBusy(false); }
  };
  useEffect(() => {
    void loadList();
    const t = setInterval(() => !document.hidden && loadList(), LIST_POLL_MS);
    return () => clearInterval(t);
  }, [loadList]);

  // first visit: the first token the team holds, else the busiest on Pons
  useEffect(() => {
    if (!pick && tokens?.length) setPick({ token: tokens[0]!.token, symbol: tokens[0]!.symbol, pool: tokens[0]!.pool });
  }, [tokens, pick]);

  const token = pick?.token;
  const activeToken = useRef(token);
  activeToken.current = token;
  const view = viewState && viewState.token === token ? viewState.data : null;
  const loadView = useCallback(async () => {
    if (!token) return;
    try {
      const v = await api.token(token);
      views.current.set(token, v);
      if (activeToken.current === token) { setView({ token, data: v }); setViewError(false); }
    } catch {
      if (activeToken.current === token) setViewError(true);
    }
  }, [token]);
  useEffect(() => {
    const cached = token ? views.current.get(token) : null;
    setView(token && cached ? { token, data: cached } : null);
    setViewError(false);
    void loadView();
    const t = setInterval(() => !document.hidden && loadView(), VIEW_POLL_MS);
    return () => clearInterval(t);
  }, [token, loadView, retry]);

  // candles straight from GeckoTerminal: the pool from the list when it has one, else from the server's lookup
  const pool = view?.market?.pool ?? pick?.pool;
  useEffect(() => {
    if (!pool) return;
    const key = `${pool}-${tf}`;
    let live = true;
    const load = () =>
      loadCandles(pool, tf)
        .then((list) => live && (setBars({ key, list }), setBarsError(false)))
        .catch(() => live && setBarsError(true));
    setBarsError(false);
    void load();
    const t = setInterval(() => !document.hidden && load(), CANDLE_POLL_MS);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [pool, tf, retry]);
  const shownBars = bars && pool && bars.key === `${pool}-${tf}` ? bars.list : null;

  const shown = useMemo(() => {
    const local = (tokens ?? []).filter((t) => !query || t.symbol.toLowerCase().includes(query) || t.token.toLowerCase().includes(query));
    const remote = search?.q === query ? search.tokens : [];
    return [...local, ...remote.filter((t) => !local.some((n) => n.token.toLowerCase() === t.token.toLowerCase()))]
      .filter((t) => filter === "all" || (filter === "held" ? t.group === "held" : t.venue === filter));
  }, [tokens, query, search, filter]);
  const pasted = isAddress(find.trim()) && !shown.length ? getAddress(find.trim()) : null;
  const searching = query.length >= 2 && !isAddress(query) && search?.q !== query;

  const last = shownBars?.at(-1)?.close ?? view?.market?.priceEth ?? null;
  const first = shownBars?.[0]?.open ?? null;
  const change = last && first ? (last / first - 1) * 100 : null;
  const pos = view?.position ?? null;
  const entry = pos && pos.tokens > 0 ? pos.costEth / pos.tokens : null;
  const decisions = pick ? snap.events.filter((e) => e.token?.toLowerCase() === pick.token.toLowerCase()).slice(0, 8) : [];

  return (
    <div className={s.trade} data-sheet={sheet ?? undefined}>
      <aside className={s.tokens} aria-label="Tokens">
        <label htmlFor="find" className="sr-only">Find a token</label>
        <input id="find" className="field" placeholder="Symbol or address" value={find} onChange={(e) => setFind(e.target.value)} autoComplete="off" spellCheck={false} />
        <div className={s.marketFilters} role="group" aria-label="Token filter">
          {[["all", "All"], ["held", "Held"], ["dex", "Established"], ["curve", "Curve"], ["graduated", "Graduated"]].map(([key, label]) => <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key!)}>{label}</button>)}
        </div>
        <p className={s.marketStatus} role="status">{searching ? "Searching beyond this list…" : `${shown.length} tokens${query ? " found" : " loaded"}`}</p>
        {listError || (search?.q === query && search.error) ? <p className={s.marketStatus} role="alert">Market data is temporarily unavailable. <button type="button" className={s.linkish} onClick={() => { void loadList(); setSearch(null); setFind(""); }}>Retry</button></p> : null}
        <ul className={s.tokenList}>
          {tokens === null && !listError ? [0, 1, 2, 3, 4].map((i) => <li key={i} className={`${s.tokenRow} ${s.skeleton}`} style={{ height: 46, animationDelay: `${i * 90}ms` }} aria-hidden />) : null}
          {pasted ? (
            <li>
              <button type="button" className={s.tokenRow} onClick={() => { setPick({ token: pasted, symbol: short(pasted) }); setFind(""); }}>
                <span className={s.tokenSym}>{short(pasted)}</span>
                <span className="faint">Open</span>
              </button>
            </li>
          ) : null}
          {!shown.length && !pasted && !searching && tokens !== null ? <li className={s.marketStatus}>No matching tokens. Try another symbol or paste a contract address.</li> : null}
          {shown.map((t, i) => (
            <li key={t.token} data-split={i > 0 && t.group === "market" && shown[i - 1]!.group !== "market" ? "" : undefined}>
              <button type="button" className={s.tokenRow} aria-current={pick?.token === t.token ? "true" : undefined} onClick={() => setPick({ token: t.token, symbol: t.symbol, pool: t.pool })}>
                <span className={s.tokenSym}>{t.symbol}</span>
                <span className="num faint">{t.group === "held" ? "In wallet" : usd(t.mcapUsd)}</span>
                <span className={s.tokenSub}>{t.venue === "dex" ? "DEX" : t.venue === "graduated" ? "Uniswap" : t.curvePct !== undefined ? `Curve ${t.curvePct.toFixed(0)}%` : t.group === "traded" ? "Traded" : "Pons"}</span>
                <span className={`num ${s.tokenSub}`}>{t.volume1hUsd !== undefined ? `${usd(t.volume1hUsd)} 1h` : ""}</span>
              </button>
            </li>
          ))}
        </ul>
        {!query && hasMore ? <button type="button" className={`btn ${s.loadMore}`} disabled={moreBusy} onClick={() => void loadMore()}>{moreBusy ? "Loading?" : "Load more tokens"}</button> : null}
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
            <div><dt>{view?.market?.venue === "curve" ? "Curve" : "Venue"}</dt><dd className="num">{view?.market?.venue === "graduated" ? "Uniswap v4" : view?.market?.venue === "dex" ? "Any DEX, via 0x" : view?.market?.curvePct !== undefined ? `${view.market.curvePct.toFixed(0)}%` : "–"}</dd></div>
          </dl>
        </header>

        <div className={s.chartWrap}>
          <div className={s.seg} role="group" aria-label="Candle size">
            {TIMEFRAMES.map((t) => <button key={t} type="button" aria-pressed={tf === t} onClick={() => setTf(t)}>{t}</button>)}
          </div>
          {barsError || viewError ? <div className={s.dataNotice} role="status">{shownBars?.length ? "Showing the last available candles. " : "Market data is temporarily unavailable. "}<button type="button" className={s.linkish} onClick={() => setRetry((n) => n + 1)}>Retry</button></div> : null}
          <Chart candles={shownBars ?? []} fills={view?.trades ?? []} entry={entry} fitKey={`${pick?.token}-${tf}`} />
          <AnimatePresence>
            {!shownBars?.length ? (
              <motion.p key={barsError ? "error" : shownBars ? "empty" : "loading"} className={s.chartState} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {barsError ? "GeckoTerminal is busy. Trying again in a few seconds…" : shownBars ? "No trades in this window yet." : view && !pool ? "No market data for this token yet." : !pick ? "Select a token or search by contract address." : viewError ? "Could not load this token. Use Retry above." : <span className={s.chartLoading} aria-label="Loading candles" />}
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>

        <div className={s.deskGrid}>
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
                    {txUrl(f.hash) ? <a className="num" href={txUrl(f.hash)} target="_blank" rel="noopener">{ago(f.at)}</a> : <span className="num faint">Paper · {ago(f.at)}</span>}
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
                      <span><strong>{TEAM[e.member as Member]?.name ?? "Hoodie"}</strong> {e.text}</span>
                      <time className="num faint">{ago(e.at)}</time>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>
        </div>
      </section>

      <div className={s.tradeBar}>
        <button type="button" className={`btn ${s.go}`} data-side="buy" onClick={() => setSheet("buy")}>Buy</button>
        <button type="button" className={`btn ${s.go}`} data-side="sell" onClick={() => setSheet("sell")}>Sell</button>
      </div>
      <button type="button" className={s.scrim} aria-hidden tabIndex={-1} onClick={() => setSheet(null)} />
      <aside className={s.ticketCol} aria-label="Order">
        <button type="button" className={s.grabber} aria-label="Close the order" onClick={() => setSheet(null)} />
        <Ticket pick={pick} snap={snap} view={view} last={last} side={sheet ?? undefined} onDone={() => { void loadView(); onChange(); }} />
      </aside>
    </div>
  );
}

