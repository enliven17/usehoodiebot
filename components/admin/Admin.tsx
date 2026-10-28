"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";

import { Mark } from "@/components/Logo";
import { QUESTIONS } from "@/lib/apply";
import { addressUrl, txUrl } from "@/lib/chain/robinhood-urls";
import { ago } from "@/lib/format";
import { TEAM, type Member } from "@/lib/team";

import s from "./admin.module.css";

type Status = "pending" | "approved" | "rejected";
type Application = { id: string; owner: string; answers: Record<string, string | string[]>; status: Status; submittedAt: number; decidedAt: number | null };
type Data = {
  counts: { teams: number; trades: number; volumeWei: string; activeStrategies: number; autoStrategies: number; openPositions: number; pendingApprovals: number; feesPaidWei: string; feesOwedWei: string; applications: Record<Status, number> };
  teams: Array<{ owner: string; wallet: string; createdAt: number; trades: number; volumeWei: string; strategies: number; open: number }>;
  trades: Array<{ owner: string; side: "buy" | "sell"; symbol: string; token: string; wei: string; hash: string; at: number }>;
  events: Array<{ owner: string; member: string; kind: string; text: string; at: number }>;
  applications: Application[];
  usage: { owners: Usage[]; models: Usage[] };
};
type Usage = { key: string; jobs: number; finished: number; steps: number; tools: number; input: number; output: number };

const tokens = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(Math.round(n)));

/** The comptroller's table: what each owner's (or model's) chats cost, per finished job, worst first. */
function UsageTable({ rows, label, short: shorten }: { rows: Usage[]; label: string; short?: boolean }) {
  if (!rows.length) return <p className="faint">No chats in the last 7 days.</p>;
  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <thead><tr><th>{label}</th><th>Jobs</th><th>Finished</th><th>Steps / job</th><th>Tool calls</th><th>Tokens in</th><th>Tokens out</th><th>Per finished job</th></tr></thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.key}>
              <td className="num">{shorten ? short(u.key) : u.key}</td>
              <td className="num">{u.jobs}</td>
              <td className="num">{u.finished}</td>
              <td className="num">{(u.steps / Math.max(1, u.jobs)).toFixed(1)}</td>
              <td className="num">{u.tools}</td>
              <td className="num">{tokens(u.input)}</td>
              <td className="num">{tokens(u.output)}</td>
              <td className="num">{tokens((u.input + u.output) / Math.max(1, u.finished))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const eth = (wei: string) => `${(Number(BigInt(wei)) / 1e18).toFixed(4).replace(/\.?0+$/, "") || "0"} ETH`;
const FILTERS = ["pending", "approved", "rejected", "all"] as const;

/** The admin's view of the whole platform, and the waitlist to let people in from. */
export function Admin() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("pending");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin");
    if (!r.ok) return setError("Could not load. Sign in with the admin wallet on /app first.");
    setData((await r.json()) as Data);
  }, []);
  useEffect(() => {
    void load();
    const t = setInterval(() => !document.hidden && load(), 20_000);
    return () => clearInterval(t);
  }, [load]);

  async function decide(id: string, status: Status) {
    setBusy(id);
    try {
      const r = await fetch(`/api/admin/applications/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Failed.");
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const apps = data?.applications.filter((a) => filter === "all" || a.status === filter) ?? [];
  const c = data?.counts;

  return (
    <div className={s.page}>
      <header className={s.head}>
        <Link href="/app" className={s.back} aria-label="Back to the app"><Mark size={24} /></Link>
        <h1>Admin</h1>
        <button type="button" className="btn" onClick={() => void load()}>Refresh</button>
      </header>
      {error ? <p className="down" role="alert">{error}</p> : null}

      <dl className={s.stats}>
        {[
          ["Waiting", c?.applications.pending],
          ["Approved", c?.applications.approved],
          ["Teams", c?.teams],
          ["Trades", c?.trades],
          ["Volume", c ? eth(c.volumeWei) : undefined],
          ["Fees earned", c ? eth(c.feesPaidWei) : undefined],
          ["Fees owed", c ? eth(c.feesOwedWei) : undefined],
          ["Strategies on", c ? `${c.activeStrategies} (${c.autoStrategies} auto)` : undefined],
          ["Open positions", c?.openPositions],
          ["Approvals waiting", c?.pendingApprovals],
        ].map(([k, v]) => (
          <div key={k as string}><dt>{k}</dt><dd className="num">{v ?? "–"}</dd></div>
        ))}
      </dl>

      <section className={s.section} aria-labelledby="apps-h">
        <div className={s.sectionHead}>
          <h2 id="apps-h">Waitlist</h2>
          <div className={s.tabs} role="group" aria-label="Show">
            {FILTERS.map((f) => (
              <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f[0]!.toUpperCase() + f.slice(1)}{f !== "all" && c ? ` ${c.applications[f]}` : ""}
              </button>
            ))}
          </div>
        </div>
        {!apps.length ? <p className="faint">Nothing here.</p> : null}
        <ul className={s.apps}>
          {apps.map((a) => (
            <li key={a.id} className={s.app} data-status={a.status}>
              <button type="button" className={s.appRow} aria-expanded={open === a.id} onClick={() => setOpen(open === a.id ? null : a.id)}>
                <span className={s.appWho}>
                  <strong>{String(a.answers.x || short(a.owner))}</strong>
                  <span className="faint">{String(a.answers.role ?? "")}</span>
                </span>
                <span className="num faint">{String(a.answers.volume ?? "")}</span>
                <span className={s.badge} data-status={a.status}>{a.status}</span>
                <time className="num faint">{ago(a.submittedAt)}</time>
              </button>
              <AnimatePresence initial={false}>
                {open === a.id ? (
                  <motion.div className={s.appBody} initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}>
                    <dl className={s.answers}>
                      <div><dt>Wallet</dt><dd><a className="num" href={addressUrl(a.owner)} target="_blank" rel="noopener">{a.owner}</a></dd></div>
                      {QUESTIONS.map((q) => (
                        <div key={q.id}><dt>{q.label}</dt><dd>{Array.isArray(a.answers[q.id]) ? (a.answers[q.id] as string[]).join(", ") : String(a.answers[q.id] || "–")}</dd></div>
                      ))}
                    </dl>
                    <div className={s.actions}>
                      {a.status !== "approved" ? <button type="button" className="btn btn-primary" disabled={busy === a.id} onClick={() => decide(a.id, "approved")}>Approve</button> : null}
                      {a.status !== "rejected" ? <button type="button" className="btn" disabled={busy === a.id} onClick={() => decide(a.id, "rejected")}>Reject</button> : null}
                      {a.status !== "pending" ? <button type="button" className="btn" disabled={busy === a.id} onClick={() => decide(a.id, "pending")}>Back to waiting</button> : null}
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </li>
          ))}
        </ul>
      </section>

      <section className={s.section} aria-labelledby="usage-h">
        <h2 id="usage-h">AI cost, last 7 days</h2>
        <UsageTable rows={data?.usage.owners ?? []} label="Owner" short />
        <h2 className={s.gap}>By model</h2>
        <UsageTable rows={data?.usage.models ?? []} label="Model" />
      </section>

      <div className={s.cols}>
        <section className={s.section} aria-labelledby="teams-h">
          <h2 id="teams-h">Teams</h2>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead><tr><th>Owner</th><th>Team wallet</th><th>Joined</th><th>Trades</th><th>Volume</th><th>Strategies</th><th>Open</th></tr></thead>
              <tbody>
                {data?.teams.map((t) => (
                  <tr key={t.owner}>
                    <td><a className="num" href={addressUrl(t.owner)} target="_blank" rel="noopener">{short(t.owner)}</a></td>
                    <td><a className="num" href={addressUrl(t.wallet)} target="_blank" rel="noopener">{short(t.wallet)}</a></td>
                    <td className="num faint">{ago(t.createdAt)}</td>
                    <td className="num">{t.trades}</td>
                    <td className="num">{eth(t.volumeWei)}</td>
                    <td className="num">{t.strategies}</td>
                    <td className="num">{t.open}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={s.section} aria-labelledby="trades-h">
          <h2 id="trades-h">Latest trades</h2>
          {!data?.trades.length ? <p className="faint">None yet.</p> : null}
          <ul className={s.feed}>
            {data?.trades.map((t) => (
              <li key={t.hash}>
                <span className={t.side === "buy" ? "up" : "down"}>{t.side === "buy" ? "Buy" : "Sell"}</span>
                <a href={addressUrl(t.token)} target="_blank" rel="noopener">{t.symbol}</a>
                <span className="num">{eth(t.wei)}</span>
                <span className="num faint">{short(t.owner)}</span>
                <a className="num faint" href={txUrl(t.hash)} target="_blank" rel="noopener">{ago(t.at)}</a>
              </li>
            ))}
          </ul>

          <h2 className={s.gap}>Latest decisions</h2>
          <ul className={s.feed}>
            {data?.events.map((e, i) => (
              <li key={i} className={s.event} style={{ ["--eye" as string]: TEAM[e.member as Member]?.eyes ?? TEAM.hoodiebot.eyes }}>
                <span><strong>{TEAM[e.member as Member]?.name ?? "Hoodie"}</strong> {e.text}</span>
                <span className="num faint">{short(e.owner)} · {ago(e.at)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
