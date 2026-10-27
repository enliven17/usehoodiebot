"use client";

import { useState } from "react";

import { api } from "./api";
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
export function Builder({ autopilot, onSaved }: { autopilot: boolean; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [watch, setWatch] = useState<(typeof WATCH)[number][0]>("new");
  const [v, setV] = useState<Record<string, string>>({ sizeEth: "0.01", maxOpen: "3", minSafetyScore: "60", slippagePct: "3", maxMcapUsd: "60000", minLiquidityUsd: "5000", minBuySellRatio: "1.5", takeProfitPct: "80", stopLossPct: "35" });
  const [mode, setMode] = useState<"ask" | "auto">("ask");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const spec: Record<string, unknown> = { watch };
      for (const f of FIELDS) {
        const n = Number(v[f.key]);
        if (v[f.key] && Number.isFinite(n)) spec[f.key === "slippagePct" ? "slippageBps" : f.key] = f.key === "slippagePct" ? n * 100 : n;
      }
      await api.createStrategy({ name: name.trim() || "My strategy", spec, mode });
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
      <div className={s.applyNav}>
        <span className="faint" style={{ fontSize: 12.5 }}>ShieldBot checks every match before a buy.</span>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save strategy"}</button>
      </div>
      <p className={s.error} role="alert">{error}</p>
    </form>
  );
}
