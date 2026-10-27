"use client";

import { CandlestickSeries, ColorType, createChart, createSeriesMarkers, HistogramSeries, LineStyle, type IChartApi, type IPriceLine, type ISeriesApi, type ISeriesMarkersPluginApi, type SeriesMarker, type Time, type UTCTimestamp } from "lightweight-charts";
import { useEffect, useRef } from "react";

import { price } from "@/lib/format";

import s from "./app.module.css";

export type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
export type Fill = { side: "buy" | "sell"; eth: number; tokens: number; hash: string; at: number };

const UP = "#9fe8b5";
const DOWN = "#fca5a5";

/** The candle a fill belongs to: the last one that opened at or before it (empty minutes have no candle). */
function candleTime(candles: Candle[], at: number): number | null {
  const t = at / 1000;
  let hit: number | null = null;
  for (const c of candles) {
    if (c.time > t) break;
    hit = c.time;
  }
  return hit;
}

/**
 * Candles in ETH with the team's buys and sells marked on them, and its average entry as a dashed line.
 * `fitKey` refits the view when the token or candle size changes; a poll with new candles keeps the owner's zoom.
 */
export function Chart({ candles, fills, entry, fitKey }: { candles: Candle[]; fills: Fill[]; entry: number | null; fitKey: string }) {
  const box = useRef<HTMLDivElement>(null);
  const api = useRef<{ chart: IChartApi; bars: ISeriesApi<"Candlestick">; vol: ISeriesApi<"Histogram">; marks: ISeriesMarkersPluginApi<Time>; line: IPriceLine | null } | null>(null);
  const fitted = useRef("");

  useEffect(() => {
    const chart = createChart(box.current!, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#9aa4b4", fontFamily: "var(--font-geist-mono), ui-monospace, monospace", fontSize: 11, attributionLogo: false },
      grid: { vertLines: { color: "rgba(255,255,255,.035)" }, horzLines: { color: "rgba(255,255,255,.035)" } },
      rightPriceScale: { borderColor: "rgba(255,255,255,.09)" },
      timeScale: { borderColor: "rgba(255,255,255,.09)", timeVisible: true, secondsVisible: false },
      crosshair: { vertLine: { color: "rgba(255,255,255,.25)", labelBackgroundColor: "#151b26" }, horzLine: { color: "rgba(255,255,255,.25)", labelBackgroundColor: "#151b26" } },
      localization: { priceFormatter: price },
    });
    const bars = chart.addSeries(CandlestickSeries, { upColor: UP, downColor: DOWN, borderVisible: false, wickUpColor: UP, wickDownColor: DOWN, // 1 / minMove has to come out a whole power of ten in floating point; 1e-16 does, 1e-18 does not
      priceFormat: { type: "custom", formatter: price, minMove: 1e-16 } });
    const vol = chart.addSeries(HistogramSeries, { priceScaleId: "", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false });
    vol.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    api.current = { chart, bars, vol, marks: createSeriesMarkers(bars, []), line: null };
    return () => {
      chart.remove();
      api.current = null;
    };
  }, []);

  useEffect(() => {
    const a = api.current;
    if (!a) return;
    a.bars.setData(candles.map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close })));
    a.vol.setData(candles.map((c) => ({ time: c.time as UTCTimestamp, value: c.volume, color: c.close >= c.open ? "rgba(159,232,181,.22)" : "rgba(252,165,165,.22)" })));
    const marks: SeriesMarker<Time>[] = fills
      .map((f) => ({ f, time: candleTime(candles, f.at) }))
      .filter((m): m is { f: Fill; time: number } => m.time !== null)
      .sort((x, y) => x.time - y.time)
      .map(({ f, time }) => ({
        time: time as UTCTimestamp,
        position: f.side === "buy" ? "belowBar" : "aboveBar",
        shape: f.side === "buy" ? "arrowUp" : "arrowDown",
        color: f.side === "buy" ? UP : DOWN,
        text: `${f.side === "buy" ? "B" : "S"} ${f.eth.toFixed(4).replace(/\.?0+$/, "")}`,
      }));
    a.marks.setMarkers(marks);
    if (a.line) a.bars.removePriceLine(a.line);
    a.line = entry ? a.bars.createPriceLine({ price: entry, color: "#bff6fb", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "avg entry" }) : null;
    if (candles.length && fitted.current !== fitKey) {
      fitted.current = fitKey;
      a.chart.timeScale().fitContent();
    }
  }, [candles, fills, entry, fitKey]);

  return <div ref={box} className={s.chart} />;
}
