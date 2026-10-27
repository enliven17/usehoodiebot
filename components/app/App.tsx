"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { Field, fieldEvent } from "@/components/Field";
import { Hoodie, type Mood } from "@/components/Hoodie";
import { Mark } from "@/components/Logo";
import { ShimmeringText } from "@/components/ui/ShimmeringText";
import { TEAM, type Member } from "@/lib/team";

import { api, type Line, type Snapshot } from "./api";
import s from "./app.module.css";
import { Activity, Approvals, Positions, Strategies, TeamStrip, Wallet } from "./Side";
import { SignIn } from "./SignIn";

const STARTERS = [
  ["scan", "What is moving on Pons right now?"],
  ["wallet", "How much can my team trade with?"],
  ["strategy", "Watch new launches under $60k mcap with 5k liquidity and buys beating sells. 0.01 ETH each, ask me first, take profit at 80%, stop at 35%."],
  ["launch", "What do I need to launch a token on Pons?"],
] as const;

const STEP_LABEL: Record<string, string> = {
  scan_market: "scanned the market", research_token: "read the token", get_wallet: "checked the wallet", propose_trade: "prepared a trade",
  create_strategy: "saved a strategy", list_strategies: "read your strategies", update_strategy: "updated a strategy", prepare_launch: "checked the launch",
};

type Panel = "chat" | "team";

export function App({ signedIn }: { signedIn: boolean }) {
  const params = useSearchParams();
  const [authed, setAuthed] = useState(signedIn);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [text, setText] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>("chat");
  const bottom = useRef<HTMLDivElement>(null);
  const seeded = useRef(false);

  const refresh = useCallback(async () => {
    try {
      setSnap(await api.team());
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 404) setSnap(await api.createTeam());
      else if (status === 401) setAuthed(false);
    }
  }, []);

  useEffect(() => {
    if (!authed) return;
    void refresh();
    api.lines().then((r) => setLines(r.lines)).catch(() => {});
    const t = setInterval(() => !document.hidden && refresh(), 15_000);
    return () => clearInterval(t);
  }, [authed, refresh]);

  useEffect(() => {
    void bottom.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [lines, thinking]);

  const send = useCallback(async (q: string) => {
    const msg = q.trim();
    if (!msg || thinking) return;
    setError(null);
    setText("");
    setThinking(true);
    fieldEvent("pulse");
    setLines((l) => [...l, { id: `local-${Date.now()}`, who: "me", text: msg, steps: [] }]);
    try {
      setLines((await api.send(msg)).lines);
      void refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setThinking(false);
    }
  }, [thinking, refresh]);

  // a prompt handed over from the landing page composer
  useEffect(() => {
    const q = params.get("q");
    if (authed && snap && q && !seeded.current) {
      seeded.current = true;
      window.history.replaceState(null, "", "/app");
      void send(q);
    }
  }, [authed, snap, params, send]);

  if (!authed) {
    return (
      <>
        <Field />
        <main className={s.solo}>
          <SignIn onDone={() => setAuthed(true)} />
        </main>
      </>
    );
  }

  const pending = snap?.approvals.filter((a) => a.status === "pending").length ?? 0;
  const mood: Mood = thinking ? "thinking" : pending ? "listening" : error ? "sad" : "idle";

  return (
    <div className={s.shell} data-panel={panel}>
      <Field targetId="composer" />
      <nav className={s.rail} aria-label="App">
        <Link href="/" className={s.railBrand} aria-label="HOODIEBOT home"><Mark size={26} /></Link>
        <button type="button" className={s.railBtn} aria-current={panel === "chat" ? "page" : undefined} onClick={() => setPanel("chat")} aria-label="Chat">
          <svg className="i" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
        </button>
        <button type="button" className={s.railBtn} aria-current={panel === "team" ? "page" : undefined} onClick={() => setPanel("team")} aria-label="Wallet and strategies">
          <svg className="i" viewBox="0 0 24 24"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" /><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" /></svg>
          {pending ? <span className={s.badge}>{pending}</span> : null}
        </button>
        <button type="button" className={s.railBtn} onClick={() => api.newChat().then((r) => setLines(r.lines))} aria-label="New chat">
          <svg className="i" viewBox="0 0 24 24"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" /></svg>
        </button>
        <button type="button" className={`${s.railBtn} ${s.railEnd}`} onClick={() => api.logout().then(() => setAuthed(false))} aria-label="Sign out">
          <svg className="i" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg>
        </button>
      </nav>

      <main className={s.main}>
        <div className={s.thread} aria-live="polite">
          {!lines.length ? (
            <div className={s.empty}>
              <TeamStrip />
              <h1 className={s.hello}>What should the team <span className="grad">watch</span>?</h1>
              <ul className={s.chips}>
                {STARTERS.map(([k, q]) => (
                  <li key={k}><button type="button" className="chip" onClick={() => send(q)}><span className="slash">/</span>{k}</button></li>
                ))}
              </ul>
            </div>
          ) : (
            lines.map((l) => <Message key={l.id} line={l} />)
          )}
          {thinking ? (
            <div className={s.msg}>
              <Hoodie size={34} mood="thinking" />
              <p className={s.bubble}><ShimmeringText text="The team is on it…" /></p>
            </div>
          ) : null}
          <div ref={bottom} />
        </div>

        <form
          id="composer"
          className={s.composer}
          onSubmit={(e) => {
            e.preventDefault();
            void send(text);
          }}
        >
          <label htmlFor="prompt" className="sr-only">Message HOODIEBOT</label>
          <textarea
            id="prompt"
            rows={1}
            value={text}
            placeholder="Ask HOODIEBOT…"
            onChange={(e) => {
              setText(e.target.value);
              fieldEvent("typing");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(text);
              }
            }}
          />
          <div className={s.toolbar}>
            <span className={s.who}><Hoodie size={26} mood={mood} />{error ? <span className="down">{error}</span> : "Robinhood Chain · mainnet"}</span>
            <button type="submit" className={s.send} data-ready={text.trim() && !thinking ? "" : undefined} disabled={thinking} aria-label="Send">
              <svg className="i" viewBox="0 0 24 24"><path d="M7 7h10v10" /><path d="M7 17 17 7" /></svg>
            </button>
          </div>
        </form>
      </main>

      <aside className={s.side} aria-label="Team">
        {snap ? (
          <>
            <Approvals snap={snap} onChange={refresh} />
            <Wallet snap={snap} onChange={refresh} />
            <Positions snap={snap} />
            <Strategies snap={snap} onChange={refresh} />
            <Activity snap={snap} />
          </>
        ) : (
          <p className="faint" style={{ padding: 20 }}>Loading your team…</p>
        )}
      </aside>
    </div>
  );
}

function Message({ line }: { line: Line }) {
  if (line.who === "me") {
    return (
      <div className={`${s.msg} ${s.me}`}>
        <p className={s.bubble}>{line.text}</p>
      </div>
    );
  }
  const members = [...new Set(line.steps.map((st) => st.member))] as Member[];
  const lead = members.find((m) => m !== "hoodiebot") ?? "hoodiebot";
  return (
    <div className={s.msg}>
      <Hoodie member={lead} size={34} mood="idle" />
      <div className={s.bubble}>
        {line.steps.length ? (
          <p className={s.steps}>
            {line.steps.map((st, i) => (
              <span key={i}>{TEAM[st.member as Member]?.name ?? "HOODIEBOT"} {STEP_LABEL[st.tool] ?? st.tool}</span>
            ))}
          </p>
        ) : null}
        {line.text.split(/\n{2,}/).map((p, i) => <p key={i} className={s.para}>{p}</p>)}
      </div>
    </div>
  );
}
