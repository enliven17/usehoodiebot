"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Field, fieldEvent } from "@/components/Field";
import { Hoodie, type Mood } from "@/components/Hoodie";
import { Mark } from "@/components/Logo";
import { ShimmeringText } from "@/components/ui/ShimmeringText";

import { api, type Access, type AccessInfo, type Line, type Snapshot } from "./api";
import { Agents } from "./Agents";
import { Activity, type TokenPick } from "./Activity";
import { Apply } from "./Apply";
import s from "./app.module.css";
import { History } from "./History";
import { Message } from "./Message";
import { PlanBlock } from "./Plans";
import { Approvals, Positions, SideSkeleton, Strategies, TeamStrip, Wallet } from "./Side";
import { SignIn } from "./SignIn";
import { Timeline } from "./Timeline";
import { Trade } from "./Trade";

/** How often the side panel refreshes: the strategy tick runs every minute, approvals should show up quickly. */
const POLL_MS = 8_000;
const EASE = [0.2, 0.7, 0.2, 1] as const;

const STARTERS = [
  ["scan", "What is moving on Pons right now?"],
  ["wallet", "How much can my team trade with?"],
  ["strategy", "Watch new launches under $60k mcap with 5k liquidity and buys beating sells. 0.01 ETH each, ask me first, take profit at 80%, stop at 35%."],
  ["launch", "What do I need to launch a token on Pons?"],
] as const;

type Panel = "activity" | "chat" | "history" | "agents" | "trade" | "team";
const TITLES: Record<Panel, string> = { activity: "Activity", chat: "Chat", history: "Chats", agents: "Team", trade: "Trade", team: "Wallet" };

export function App({ signedIn }: { signedIn: boolean }) {
  const params = useSearchParams();
  const [authed, setAuthed] = useState(signedIn);
  // let in yet? null while it is being asked
  const [gate, setGate] = useState<Access | null>(null);
  const [admin, setAdmin] = useState(false);
  const [info, setInfo] = useState<AccessInfo | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [text, setText] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>("chat");
  // the team wallet panel, open or shut per view: open beside the chat, shut beside the trade ticket until asked for
  const [sideOpen, setSideOpen] = useState({ chat: true, trade: false, activity: false });
  const [tradePick, setTradePick] = useState<TokenPick | null>(null);
  const openChart = (pick: TokenPick) => { setTradePick(pick); setPanel("trade"); };
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

  // where the application stands; a pending one is asked again now and then so the app opens the moment it is approved
  const [asked, setAsked] = useState(0);
  useEffect(() => {
    if (!authed) return setGate(null);
    let live = true;
    const ask = () =>
      api.access().then((r) => live && (setGate(r.status), setAdmin(r.admin), setInfo(r))).catch((err) => live && (err as { status?: number }).status === 401 && setAuthed(false));
    void ask();
    const t = setInterval(() => !document.hidden && ask(), 20_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [authed, asked]);
  const reask = () => setAsked((n) => n + 1);

  useEffect(() => {
    if (!authed || gate !== "approved") return;
    void refresh();
    api.lines().then((r) => setLines(r.lines)).catch(() => {});
    const t = setInterval(() => !document.hidden && refresh(), POLL_MS);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [authed, gate, refresh]);

  useEffect(() => {
    if (panel !== "chat") return;
    void bottom.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [lines, thinking, panel]);

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

  // a prompt handed over from the landing page composer, waiting in the box for the owner to send
  useEffect(() => {
    const q = params.get("q");
    if (authed && snap && q && !seeded.current) {
      seeded.current = true;
      window.history.replaceState(null, "", "/app");
      // a prompt from a link is only put in the box: the owner reads it and sends it, so a crafted link cannot speak for them
      setText(q.slice(0, 4000));
      document.getElementById("prompt")?.focus();
    }
  }, [authed, snap, params, send]);

  if (!authed) {
    return (
      <>
        <Field />
        <motion.main className={s.solo} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.45, ease: EASE }}>
          <SignIn onDone={() => setAuthed(true)} />
        </motion.main>
      </>
    );
  }

  if (gate !== "approved") {
    return (
      <>
        <Field />
        <motion.main className={s.solo} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.45, ease: EASE }}>
          {gate === null ? <Hoodie size={96} mood="thinking" /> : <Apply status={gate} info={info} onSent={() => setGate("pending")} onPaid={reask} onSignOut={() => api.logout().then(() => setAuthed(false))} />}
        </motion.main>
      </>
    );
  }

  const sideKey = panel === "activity" ? "activity" : panel === "trade" ? "trade" : "chat";
  // phones and tablets show the panel as its own page; wider screens slide it open and shut beside the view
  const toggleWallet = () =>
    window.matchMedia("(max-width: 65rem)").matches ? setPanel((p) => (p === "team" ? "chat" : "team")) : setSideOpen((o) => ({ ...o, [sideKey]: !o[sideKey] }));

  const pending = snap?.approvals.filter((a) => a.status === "pending").length ?? 0;
  const mood: Mood = thinking ? "thinking" : pending ? "listening" : error ? "sad" : "idle";

  return (
    <motion.div className={s.shell} data-panel={panel} data-side={sideOpen[sideKey] ? "open" : "closed"} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, ease: EASE }}>
      {panel === "chat" ? <Field targetId="composer" /> : null}
      <header className={s.topbar}>
        <Link href="/" aria-label="HOODIEBOT home"><Mark size={22} /></Link>
        <strong>{TITLES[panel]}</strong>
        {panel === "chat" ? (
          <button type="button" className={s.topBtn} onClick={() => api.newChat().then((r) => setLines(r.lines))} aria-label="New chat">
            <svg className="i" viewBox="0 0 24 24"><path d="M12 5v14" /><path d="M5 12h14" /></svg>
          </button>
        ) : null}
        {admin ? (
          <Link href="/admin" className={s.topBtn} aria-label="Admin">
            <svg className="i" viewBox="0 0 24 24"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /></svg>
          </Link>
        ) : null}
        <button type="button" className={s.topBtn} onClick={() => api.logout().then(() => setAuthed(false))} aria-label="Sign out">
          <svg className="i" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg>
        </button>
      </header>
      <nav className={s.rail} aria-label="App">
        <Link href="/" className={s.railBrand} aria-label="HOODIEBOT home"><Mark size={26} /></Link>
        <button type="button" className={s.railBtn} aria-current={panel === "chat" ? "page" : undefined} onClick={() => setPanel("chat")} aria-label="Chat">
          <svg className="i" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
          <span className={s.railLabel}>Chat</span>
        </button>
        <button type="button" className={s.railBtn} aria-current={panel === "activity" ? "page" : undefined} onClick={() => setPanel("activity")} aria-label="Activity">
          <svg className="i" viewBox="0 0 24 24"><path d="M3 12h4l3-8 4 16 3-8h4" /></svg>
          <span className={s.railLabel}>Activity</span>
        </button>
        <button type="button" className={s.railBtn} aria-current={panel === "history" ? "page" : undefined} onClick={() => setPanel("history")} aria-label="Past chats">
          <svg className="i" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l4 2" /></svg>
          <span className={s.railLabel}>Chats</span>
        </button>
        <button type="button" className={s.railBtn} aria-current={panel === "agents" ? "page" : undefined} onClick={() => setPanel("agents")} aria-label="Team and Autopilot">
          <svg className="i" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
          <span className={s.railLabel}>Team</span>
        </button>
        <button type="button" className={s.railBtn} aria-current={panel === "trade" ? "page" : undefined} onClick={() => setPanel("trade")} aria-label="Trade">
          <svg className="i" viewBox="0 0 24 24"><path d="M3 3v16a2 2 0 0 0 2 2h16" /><path d="m19 9-5 5-4-4-3 3" /></svg>
          <span className={s.railLabel}>Trade</span>
        </button>
        <button type="button" className={s.railBtn} aria-current={panel === "team" ? "page" : undefined} aria-pressed={sideOpen[sideKey]} onClick={toggleWallet} aria-label="Team wallet">
          <svg className="i" viewBox="0 0 24 24"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" /><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" /></svg>
          {pending ? <span className={s.badge}>{pending}</span> : null}
          <span className={s.railLabel}>Wallet</span>
        </button>
        {admin ? (
          <Link href="/admin" className={`${s.railBtn} ${s.railEnd} ${s.railDesk}`} aria-label="Admin">
            <svg className="i" viewBox="0 0 24 24"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /></svg>
          </Link>
        ) : null}
        <button type="button" className={`${s.railBtn} ${s.railDesk} ${admin ? "" : s.railEnd}`} onClick={() => api.logout().then(() => setAuthed(false))} aria-label="Sign out">
          <svg className="i" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg>
        </button>
      </nav>

      <main className={s.main} data-view={panel === "activity" || panel === "trade" || panel === "history" || panel === "agents" ? panel : "chat"}>
        {panel === "trade" && snap ? <Trade key={tradePick?.token ?? "market"} snap={snap} onChange={refresh} initialPick={tradePick} /> : null}
        {panel === "activity" && snap ? <Activity snap={snap} onChange={refresh} onOpen={openChart} /> : null}
        {panel === "agents" && snap ? <Agents snap={snap} onChange={refresh} /> : null}
        {panel === "history" ? (
          <History
            onNew={() => api.newChat().then((r) => { setLines(r.lines); setPanel("chat"); })}
            onOpen={(n) => api.openChat(n).then((r) => { setLines(r.lines); setPanel("chat"); }).catch((err) => setError((err as Error).message))}
          />
        ) : null}
        <div className={s.thread} aria-live="polite">
          {!lines.length ? (
            <motion.div className={s.empty} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1, ease: EASE }}>
              <TeamStrip />
              <h1 className={s.hello}>What should the team <span className="grad">watch</span>?</h1>
              <ul className={s.chips}>
                {STARTERS.map(([k, q]) => (
                  <li key={k}><button type="button" className="chip" onClick={() => send(q)}><span className="slash">/</span>{k}</button></li>
                ))}
              </ul>
            </motion.div>
          ) : (
            lines.map((l) => <Message key={l.id} line={l} onTraded={refresh} />)
          )}
          <AnimatePresence>
            {thinking ? (
              <motion.div key="thinking" className={s.msg} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.15 } }} transition={{ duration: 0.3, ease: EASE }}>
                <Hoodie size={34} mood="thinking" />
                <p className={s.bubble}><ShimmeringText text="The team is on it…" /></p>
              </motion.div>
            ) : null}
          </AnimatePresence>
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
          <label htmlFor="prompt" className="sr-only">Message Hoodie</label>
          <textarea
            id="prompt"
            rows={1}
            value={text}
            placeholder="Ask Hoodie…"
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
            <span className={s.who}><Hoodie size={26} mood={mood} />{error ? <span className="down">{error}</span> : snap?.mode === "paper" ? "Paper trading · live prices" : "Robinhood Chain · mainnet"}</span>
            <button type="submit" className={s.send} data-ready={text.trim() && !thinking ? "" : undefined} disabled={thinking} aria-label="Send">
              <svg className="i" viewBox="0 0 24 24"><path d="M7 7h10v10" /><path d="M7 17 17 7" /></svg>
            </button>
          </div>
        </form>
      </main>

      <aside className={s.side} aria-label="Team" aria-busy={!snap}>
        <AnimatePresence mode="wait" initial={false}>
          {snap ? (
            <motion.div key="panels" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }}>
              {panel !== "activity" ? <Approvals snap={snap} onChange={refresh} /> : null}
              <Wallet snap={snap} onChange={refresh} />
              {info ? <PlanBlock info={info} onPaid={reask} /> : null}
              {panel !== "activity" ? <Timeline snap={snap} onOpen={openChart} /> : null}
              {panel !== "activity" ? <Positions snap={snap} onOpen={openChart} /> : null}
              <Strategies snap={snap} onChange={refresh} />
            </motion.div>
          ) : (
            <motion.div key="skeleton" exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <SideSkeleton />
            </motion.div>
          )}
        </AnimatePresence>
      </aside>
    </motion.div>
  );
}

