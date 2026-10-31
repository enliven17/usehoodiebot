"use client";

import { useState } from "react";

import type { Preset } from "@/lib/presets";

import { api, type BacktestRun } from "./api";
import s from "./app.module.css";

const WATCH = [["new", "New launches"], ["curve", "On the curve"], ["graduated", "Graduated"], ["all", "All Pons"]] as const;

/** Each field: what the owner types, the spec key it fills, and the unit shown beside it. */
const FIELDS: Array<{ key: string; label: string; unit: string; placeholder: string; group: "entry" | "filter" | "exit" }> = [
  { key: "sizeEth", label: "Size per buy", unit: "ETH", placeholder: "0.01", group: "entry" },
  { key: "maxOpen", label: "Open at once", unit: "max", placeholder: "3", group: "entry" },
  { key: "minSafetyScore", label: "ShieldBot score", unit: "/100", placeholder: "60", group: "entry" },
  { key: "slippagePct", label: "Slippage", unit: "%", placeholder: "3", group: "entry" },
  { key: "maxMcapUsd", label: "Market cap under", unit: "$", placeholder: "60000", group: "filter" },
  { key: "minLiquidityUsd", label: "Liquidity over", unit: "$", placeholder: "5000", group: "filter" },
  { key: "minVolume1hUsd", label: "Volume 1h over", unit: "$", placeholder: "", group: "filter" },
  { key: "minBuySellRatio", label: "Buys vs sells", unit: "x", placeholder: "1.5", group: "filter" },
  { key: "maxAgeMinutes", label: "Younger than", unit: "min", placeholder: "", group: "filter" },
  { key: "maxCurvePct", label: "Curve under", unit: "%", placeholder: "", group: "filter" },
  { key: "takeProfitPct", label: "Take profit", unit: "+%", placeholder: "80", group: "exit" },
  { key: "stopLossPct", label: "Stop loss", unit: "-%", placeholder: "35", group: "exit" },
  { key: "trailingStopPct", label: "Trailing stop", unit: "-%", placeholder: "", group: "exit" },
];
const GROUPS = [["entry", "Entry"], ["filter", "What has to pass"], ["exit", "Exits"]] as const;

/** A strategy built in the app, field by field, with the owner choosing whether it asks first or trades on its own. */
const DEFAULTS: Record<string, string> = { sizeEth: "0.01", maxOpen: "3", minSafetyScore: "60", slippagePct: "3", maxMcapUsd: "60000", minLiquidityUsd: "5000", minBuySellRatio: "1.5", takeProfitPct: "80", stopLossPct: "35" };

/** A preset's rules as the form's text fields. */
const fromPreset = (p: Preset): Record<string, string> =>
  Object.fromEntries(FIELDS.map((f) => [f.key, f.key === "slippagePct" ? String((p.spec.slippageBps ?? 300) / 100) : p.spec[f.key as keyof Preset["spec"]] === undefined ? "" : String(p.spec[f.key as keyof Preset["spec"]])]));

export function Builder({ autopilot, preset, onSaved }: { autopilot: boolean; preset?: Preset | null; onSaved: () => void }) {
  const [name, setName] = useState(preset?.name ?? "");
  const [watch, setWatch] = useState<(typeof WATCH)[number][0]>(preset?.spec.watch ?? "new");
  const [v, setV] = useState<Record<string, string>>(preset ? fromPreset(preset) : DEFAULTS);
  const [mode, setMode] = useState<"ask" | "auto">(autopilot ? "auto" : "ask");
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<BacktestRun | "running" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const specOf = () => {
    const spec: Record<string, unknown> = { watch };
    for (const f of FIELDS) {
      const n = Number(v[f.key]);
      if (v[f.key] && Number.isFinite(n)) spec[f.key === "slippagePct" ? "slippageBps" : f.key] = f.key === "slippagePct" ? n * 100 : n;
    }
    return spec;
  };

  async function runTest() {
    setTest("running");
    setError(null);
    try {
      setTest(await api.backtest({ spec: specOf() }));
    } catch (err) {
      setTest(null);
      setError((err as Error).message);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.createStrategy({ name: name.trim() || "My strategy", spec: specOf(), mode });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={s.builder} onSubmit={save}>
      <label className={s.question} htmlFor="st-name">
        <span className={s.qLabel}>Name</span>
        <input id="st-name" className="field" placeholder="Fresh launches" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className={s.question}>
        <span className={s.qLabel}>Watch</span>
        <div className={s.presets} role="radiogroup" aria-label="Watch">
          {WATCH.map(([k, label]) => <button key={k} type="button" role="radio" aria-checked={watch === k} className="chip" aria-pressed={watch === k} onClick={() => setWatch(k)}>{label}</button>)}
        </div>
      </div>
      {GROUPS.map(([g, title]) => (
        <fieldset key={g} className={s.builderGroup}>
          <legend>{title}</legend>
          {FIELDS.filter((f) => f.group === g).map((f) => (
            <label key={f.key}>
              <span>{f.label}</span>
              <span className={s.exitField}>
                <input className="num" inputMode="decimal" placeholder={f.placeholder || "any"} value={v[f.key] ?? ""} onChange={(e) => setV({ ...v, [f.key]: e.target.value.replace(/[^\d.]/g, "") })} />
                <span>{f.unit}</span>
              </span>
            </label>
          ))}
        </fieldset>
      ))}
      <div className={s.question}>
        <span className={s.qLabel}>When it matches</span>
        <div className={s.seg} role="group" aria-label="When it matches">
          <button type="button" aria-pressed={mode === "ask"} onClick={() => setMode("ask")}>Ask before each buy</button>
          <button type="button" aria-pressed={mode === "auto"} onClick={() => setMode("auto")}>Trade automatically</button>
        </div>
        {mode === "auto" && !autopilot ? <span className={s.qHint}>Autopilot is off, so it asks you until you turn Autopilot on above.</span> : null}
      </div>
      {test && test !== "running" ? (
        <div className={s.backtest}>
          {test.summary ? (
            <dl className={s.btStats}>
              <div><dt>Trades</dt><dd className="num">{test.summary.trades}</dd></div>
              <div><dt>Won</dt><dd className="num">{test.summary.winRatePct.toFixed(0)}%</dd></div>
              <div><dt>Average</dt><dd className={`num ${test.summary.avgReturnPct >= 0 ? "up" : "down"}`}>{test.summary.avgReturnPct >= 0 ? "+" : ""}{test.summary.avgReturnPct.toFixed(1)}%</dd></div>
              <div><dt>Worst</dt><dd className="num down">{test.summary.worstPct.toFixed(1)}%</dd></div>
              <div><dt>Best</dt><dd className="num up">+{test.summary.bestPct.toFixed(1)}%</dd></div>
              <div><dt>P&amp;L at this size</dt><dd className={`num ${test.summary.pnlEth >= 0 ? "up" : "down"}`}>{test.summary.pnlEth >= 0 ? "+" : ""}{test.summary.pnlEth.toFixed(4)} ETH</dd></div>
            </dl>
          ) : <p className="faint">No token had enough candles to replay right now. Try again in a minute.</p>}
          {test.tokens.length ? <p className={`num ${s.btTokens}`}>{test.tokens.map((t) => `${t.symbol} ${t.returnPct >= 0 ? "+" : ""}${t.returnPct.toFixed(0)}% (${t.reason})`).join(" · ")}</p> : null}
          <p className={s.qHint}>{test.note}</p>
        </div>
      ) : null}
      <div className={s.applyNav}>
        <button type="button" className="btn" disabled={test === "running"} onClick={runTest}>{test === "running" ? "Replaying recent tokens…" : "Backtest"}</button>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save strategy"}</button>
      </div>
      <span className="faint" style={{ fontSize: 12.5 }}>ShieldBot checks every match before a buy.</span>
      <p className={s.error} role="alert">{error}</p>
    </form>
  );
}
