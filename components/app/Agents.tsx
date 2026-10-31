"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

import { Hoodie, type Mood } from "@/components/Hoodie";
import { ago } from "@/lib/format";
import { PRESETS, type Preset } from "@/lib/presets";
import { MEMBERS, TEAM, type Member } from "@/lib/team";

import { api, type Snapshot } from "./api";
import s from "./app.module.css";
import { Builder } from "./Builder";
import { Strategies } from "./Side";

const EASE = [0.2, 0.7, 0.2, 1] as const;

/** Each kind of event, the way a count reads ("12 scans"). */
const COUNTS: Record<string, [one: string, many: string]> = {
  scan: ["scan", "scans"], research: ["token read", "tokens read"], safety: ["check", "checks"], skip: ["skipped", "skipped"],
  match: ["match", "matches"], strategy: ["strategy change", "strategy changes"], ask: ["ask", "asks"], buy: ["buy", "buys"],
  sell: ["sell", "sells"], exit: ["exit", "exits"], fail: ["failed", "failed"], sent: ["pending", "pending"], autopilot: ["autopilot change", "autopilot changes"],
};
const MOOD: Record<Member, Mood> = { hoodiebot: "idle", research: "searching", sniper: "suspicious", shield: "suspicious", trader: "working", launch: "happy" };

/**
 * The team at work: Autopilot (the owner's go-ahead to trade without asking, and its budget), each specialist with what
 * it did last and how much today, and the strategies they run, with a builder for new ones.
 */
export function Agents({ snap, onChange }: { snap: Snapshot; onChange: () => void }) {
  const [building, setBuilding] = useState(false);
  const [preset, setPreset] = useState<Preset | null>(null);
  const open = (p: Preset | null) => {
    setPreset(p);
    setBuilding(true);
    requestAnimationFrame(() => document.getElementById("builder")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  return (
    <div className={s.agentsPage}>
      <h1 className={s.pageTitle}>Your team</h1>
      <Autopilot snap={snap} onChange={onChange} />

      <ul className={s.agents}>
        {MEMBERS.map((m) => {
          const a = snap.agents[m];
          const busy = !!a.last && Date.now() - a.last.at < 5 * 60_000;
          const counts = Object.entries(a.today).filter(([k]) => COUNTS[k]);
          return (
            <li key={m} className={s.agent} style={{ ["--eye" as string]: TEAM[m].eyes }}>
              <Hoodie member={m} size={56} mood={busy ? MOOD[m] : "idle"} />
              <div className={s.agentBody}>
                <p className={s.agentHead}><strong>{TEAM[m].name}</strong>{a.last ? <time className="num faint">{ago(a.last.at)}</time> : null}</p>
                <p className={s.agentJob}>{TEAM[m].job}</p>
                <p className={s.agentLast}>{a.last ? a.last.text : "Nothing yet today."}</p>
                {counts.length ? (
                  <p className={`num ${s.agentCounts}`}>{counts.map(([k, n]) => `${n} ${n === 1 ? COUNTS[k]![0] : COUNTS[k]![1]}`).join(" · ")}</p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <Journal snap={snap} />
      <Memory snap={snap} onChange={onChange} />

      <section className={s.agentsSection}>
        <Strategies snap={snap} onChange={onChange} />
        <h2 className={s.blockTitle}>Ready-made strategies</h2>
        <ul className={s.presetsGrid}>
          {PRESETS.map((p) => (
            <li key={p.id} className={s.presetCard}>
              <p className={s.presetHead}><strong>{p.name}</strong><span className={s.risk} data-risk={p.risk}>{p.risk} risk</span></p>
              <p className={s.presetPitch}>{p.pitch}</p>
              <p className={`num ${s.presetRules}`}>
                {p.spec.sizeEth} ETH · ShieldBot {p.spec.minSafetyScore ?? "any"}+ · TP +{p.spec.takeProfitPct}% · SL -{p.spec.stopLossPct}%{p.spec.trailingStopPct ? ` · trail ${p.spec.trailingStopPct}%` : ""}
              </p>
              <button type="button" className="btn" onClick={() => open(p)}>Use this</button>
            </li>
          ))}
        </ul>
        <button type="button" className={`btn ${s.newStrategy}`} aria-expanded={building && !preset} onClick={() => (building && !preset ? setBuilding(false) : open(null))}>{building && !preset ? "Close the builder" : "Build your own"}</button>
        <AnimatePresence initial={false}>
          {building ? (
            <motion.div key={preset?.id ?? "own"} id="builder" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: EASE }} style={{ overflow: "hidden" }}>
              <Builder autopilot={snap.autopilot.on} preset={preset} onSaved={() => (setBuilding(false), setPreset(null), onChange())} />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </section>
    </div>
  );
}

function Autopilot({ snap, onChange }: { snap: Snapshot; onChange: () => void }) {
  const a = snap.autopilot;
  const [budget, setBudget] = useState(String(a.budgetEth || "0.1"));
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setBudget(String(a.budgetEth || "0.1")), [a.budgetEth]);
  const autos = snap.strategies.filter((x) => x.active && x.mode === "auto").length;
  const used = a.budgetEth ? Math.min(100, (a.deployedEth / a.budgetEth) * 100) : 0;

  // Autopilot only runs strategies: with none set to trade automatically, it has nothing to do
  async function start(p: Preset) {
    setBusy(true);
    setError(null);
    try {
      await api.createStrategy({ name: p.name, spec: p.spec, mode: "auto" });
      if (!a.on) await api.autopilot(true, Number(budget) || 0.1);
      onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function set(on: boolean) {
    setBusy(true);
    setError(null);
    try {
      await api.autopilot(on, Number(budget));
      setConfirm(false);
      onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={s.autopilot} data-on={a.on || undefined} aria-labelledby="ap-h">
      <div className={s.apHead}>
        <h2 id="ap-h">Autopilot</h2>
        <span className={s.apState}>{a.on ? "On" : "Off"}</span>
      </div>
      <p className={s.apText}>
        {a.on
          ? `Strategies set to trade automatically buy and sell without asking, up to ${a.budgetEth} ETH in open positions. ShieldBot still blocks unsafe tokens; past the budget they ask you.`
          : "Off: every strategy asks before it buys. Turn it on to let strategies set to trade automatically act on their own, inside a budget you set."}
        {autos ? ` ${autos} automatic ${autos === 1 ? "strategy" : "strategies"} running.` : " No strategy is set to trade automatically yet."}
      </p>
      {a.on && !autos ? (
        <div className={s.apConfirm}>
          <p>Autopilot has nothing to run yet. Pick a strategy and the team starts watching the market for it right away:</p>
          <div className={s.apRow}>
            {PRESETS.map((p) => (
              <button key={p.id} type="button" className="btn" disabled={busy} onClick={() => start(p)}>{p.name}</button>
            ))}
          </div>
        </div>
      ) : null}
      {a.on ? (
        <div className={s.apMeter}>
          <span style={{ width: `${used}%` }} />
          <p className="num faint">{a.deployedEth.toFixed(4)} of {a.budgetEth} ETH in use</p>
        </div>
      ) : null}
      <div className={s.apRow}>
        <label htmlFor="ap-budget" className="faint">Budget</label>
        <div className={s.exitField}><input id="ap-budget" className="num" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value.replace(",", "."))} /><span>ETH</span></div>
        {a.on ? (
          <>
            <button type="button" className="btn" disabled={busy || Number(budget) === a.budgetEth} onClick={() => set(true)}>Save budget</button>
            <button type="button" className="btn" disabled={busy} onClick={() => set(false)}>Turn off</button>
          </>
        ) : (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => setConfirm(true)}>Turn on</button>
        )}
      </div>
      <AnimatePresence>
        {confirm ? (
          <motion.div className={s.apConfirm} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="alertdialog" aria-labelledby="ap-c">
            <p id="ap-c">
              The team will buy and sell with up to <strong className="num">{Number(budget) || 0} ETH</strong> without asking you, through the strategies you set
              to trade automatically. Memecoins can go to zero. You can turn it off at any time.
            </p>
            <div className={s.apRow}>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => set(true)}>Yes, turn on Autopilot</button>
              <button type="button" className="btn" onClick={() => setConfirm(false)}>Cancel</button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <p className={s.error} role="alert">{error}</p>
    </section>
  );
}

/** The owner's trade journal: how their closed positions went and the habits behind it. */
function Journal({ snap }: { snap: Snapshot }) {
  const j = snap.journal;
  return (
    <section className={s.agentsSection} aria-labelledby="journal-h">
      <h2 id="journal-h" className={s.blockTitle}>Your journal</h2>
      {!j ? (
        <p className="faint" style={{ fontSize: 14, margin: "0 0 14px" }}>Once positions close, TraderBot reads them here: what wins, what loses, and the habits behind it.</p>
      ) : (
        <>
          <dl className={s.btStats}>
            <div><dt>Closed</dt><dd className="num">{j.closed}</dd></div>
            <div><dt>Won</dt><dd className="num">{j.winRatePct.toFixed(0)}%</dd></div>
            <div><dt>P&amp;L</dt><dd className={`num ${j.pnlEth >= 0 ? "up" : "down"}`}>{j.pnlEth >= 0 ? "+" : ""}{j.pnlEth.toFixed(4)} ETH</dd></div>
            <div><dt>Profit factor</dt><dd className="num">{j.profitFactor === null ? "–" : j.profitFactor.toFixed(2)}</dd></div>
            <div><dt>Average win</dt><dd className="num up">{j.avgWinPct === null ? "–" : `+${j.avgWinPct.toFixed(0)}%`}</dd></div>
            <div><dt>Average loss</dt><dd className="num down">{j.avgLossPct === null ? "–" : `${j.avgLossPct.toFixed(0)}%`}</dd></div>
          </dl>
          {j.habits.length ? <ul className={s.habits}>{j.habits.map((h) => <li key={h}>{h}</li>)}</ul> : null}
        </>
      )}
    </section>
  );
}

/** What the team keeps in mind across chats; the owner adds notes by saying them in chat. */
function Memory({ snap, onChange }: { snap: Snapshot; onChange: () => void }) {
  return (
    <section className={s.agentsSection} aria-labelledby="memory-h">
      <h2 id="memory-h" className={s.blockTitle}>Team memory</h2>
      {!snap.memories.length ? (
        <p className="faint" style={{ fontSize: 14, margin: "0 0 14px" }}>Tell Hoodie a rule once (&quot;never more than 0.05 ETH a trade&quot;) and every chat keeps it.</p>
      ) : (
        <ul className={s.memories}>
          {snap.memories.map((m) => (
            <li key={m.id}>
              <span>{m.text}</span>
              <button type="button" className={s.linkish} onClick={() => api.forget(m.id).then(onChange)}>Forget</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
