"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { Hoodie } from "@/components/Hoodie";
import { checkOne, QUESTIONS, type Answers, type Question } from "@/lib/apply";

import { api } from "./api";
import s from "./app.module.css";

const EASE = [0.2, 0.7, 0.2, 1] as const;
const DRAFT = "hoodie-application";
const HOSTS = ["hoodiebot", "research", "sniper", "trader", "launch"] as const;

const load = (): Answers => {
  try {
    return JSON.parse(localStorage.getItem(DRAFT) ?? "{}") as Answers;
  } catch {
    return {};
  }
};

/**
 * The way in: one question per screen, a draft kept in the browser, then a last look before sending. After sending, the
 * owner is on the waitlist; the app opens by itself once an admin approves them.
 */
export function Apply({ status, onSent, onSignOut }: { status: "none" | "pending" | "rejected"; onSent: () => void; onSignOut: () => void }) {
  const [at, setAt] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dir, setDir] = useState(1);
  const reduce = useReducedMotion();
  const input = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const submit = useRef<HTMLButtonElement>(null);

  useEffect(() => setAnswers(load()), []);
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT, JSON.stringify(answers));
    } catch {
      /* private mode: the draft just is not kept */
    }
  }, [answers]);
  // the text field when there is one, else the button, so Enter always moves on
  useEffect(() => {
    const t = setTimeout(() => (input.current ?? submit.current)?.focus({ preventScroll: true }), 320);
    return () => clearTimeout(t);
  }, [at]);

  if (status !== "none") {
    return (
      <div className={s.signin}>
        <Hoodie size={120} mood={status === "pending" ? "listening" : "sad"} />
        <h1 className={s.signinTitle}>{status === "pending" ? "You are on the waitlist" : "Not this time"}</h1>
        <p className={s.signinText}>
          {status === "pending"
            ? "Thanks, your application is in. We let people in a few at a time and read every one. Hoodie opens here by itself the moment you are approved."
            : "Your application was not approved for now. We open more places as Hoodie grows; keep an eye on our X."}
        </p>
        <button type="button" className={s.linkish} onClick={onSignOut}>Sign out</button>
      </div>
    );
  }

  const review = at === QUESTIONS.length;
  const q = QUESTIONS[at];
  const answered = QUESTIONS.filter((x) => x.kind !== "token" && !("error" in checkOne(x, answers[x.id])) && (answers[x.id]?.length ?? 0) > 0).length;
  const total = QUESTIONS.filter((x) => x.kind !== "token").length;

  const go = (n: number) => {
    setError(null);
    setDir(n > at ? 1 : -1);
    setAt(Math.max(0, Math.min(QUESTIONS.length, n)));
  };
  function next() {
    if (review) return void send();
    const r = checkOne(q!, answers[q!.id]);
    if ("error" in r) return setError(r.error);
    setAnswers((a) => ({ ...a, [q!.id]: r.value }));
    go(at + 1);
  }
  async function send() {
    setBusy(true);
    setError(null);
    try {
      await api.apply(answers);
      try {
        localStorage.removeItem(DRAFT);
      } catch {
        /* nothing kept */
      }
      onSent();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className={`${s.signin} ${s.apply}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) next();
      }}
    >
      <div className={s.applyTop}>
        <span className="num faint">{answered} of {total} answered</span>
        <button type="button" className={s.linkish} onClick={onSignOut}>Sign out</button>
      </div>
      <div className={s.progress} aria-hidden><span style={{ width: `${(at / QUESTIONS.length) * 100}%` }} /></div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={at}
          className={s.ask}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 18 * dir }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -18 * dir }}
          transition={{ duration: 0.28, ease: EASE }}
        >
          <Hoodie member={HOSTS[at % HOSTS.length]} size={64} mood={review ? "happy" : busy ? "working" : "listening"} />
          {review ? (
            <>
              <h1 className={s.askTitle}>All set. Send it over?</h1>
              <p className={s.qHint}>We read every application by hand. Tap an answer to change it.</p>
              <ul className={s.recap}>
                {QUESTIONS.map((x, i) =>
                  x.kind === "token" ? null : (
                    <li key={x.id}>
                      <button type="button" onClick={() => go(i)}>
                        <span className="faint">{x.label}</span>
                        <span>{Array.isArray(answers[x.id]) ? (answers[x.id] as string[]).join(", ") || "–" : String(answers[x.id] || "–")}</span>
                      </button>
                    </li>
                  ),
                )}
              </ul>
            </>
          ) : (
            <Ask
              q={q!}
              value={answers[q!.id]}
              input={input}
              onChange={(v) => {
                setError(null);
                setAnswers((a) => ({ ...a, [q!.id]: v }));
                // one choice: picking it is the answer, move on as a form would after a short beat
                if (q!.kind === "choice") setTimeout(() => go(at + 1), 220);
              }}
            />
          )}
        </motion.div>
      </AnimatePresence>

      <p className={s.error} role="alert">{error}</p>
      <div className={s.applyNav}>
        {at > 0 ? <button type="button" className="btn" onClick={() => go(at - 1)} disabled={busy}>Back</button> : <span />}
        <button ref={submit} type="submit" className="btn btn-primary" disabled={busy}>
          {review ? (busy ? "Sending…" : "Send application") : q?.kind === "token" ? "Continue" : q?.optional && !answers[q.id]?.length ? "Skip" : "OK"}
        </button>
      </div>
      {!review ? <p className={`${s.enterHint} faint`}>or press Enter ↵</p> : null}
    </form>
  );
}

function Ask({ q, value, input, onChange }: { q: Question; value: string | string[] | undefined; input: React.RefObject<(HTMLInputElement & HTMLTextAreaElement) | null>; onChange: (v: string | string[]) => void }) {
  const title = <h1 className={s.askTitle}>{q.label}{q.optional ? <span className="faint"> · optional</span> : null}</h1>;
  const hint = q.hint ? <p className={s.qHint}>{q.hint}</p> : null;
  if (q.kind === "token") {
    return (
      <>
        {title}
        <div className={s.options} aria-disabled>
          {["Yes, I hold $HOODIE", "Not yet"].map((o) => <button key={o} type="button" className={s.option} disabled>{o}</button>)}
        </div>
        {hint}
      </>
    );
  }
  if (q.kind === "choice" || q.kind === "multi") {
    const multi = q.kind === "multi";
    const picked = multi ? ((value as string[] | undefined) ?? []) : value ? [value as string] : [];
    return (
      <>
        {title}
        {hint}
        <div className={s.options} role={multi ? "group" : "radiogroup"} aria-label={q.label}>
          {(q.options ?? []).map((o, i) => (
            <button
              key={o}
              type="button"
              className={s.option}
              role={multi ? undefined : "radio"}
              aria-checked={multi ? undefined : picked.includes(o)}
              aria-pressed={multi ? picked.includes(o) : undefined}
              onClick={() => onChange(multi ? (picked.includes(o) ? picked.filter((x) => x !== o) : [...picked, o]) : o)}
            >
              <span className={`num ${s.key}`}>{String.fromCharCode(65 + i)}</span>
              {o}
            </button>
          ))}
        </div>
      </>
    );
  }
  const text = (value as string) ?? "";
  return (
    <>
      {title}
      {hint}
      {q.kind === "long" ? (
        <div className={s.longWrap}>
          <textarea
            ref={input}
            className="field"
            rows={3}
            maxLength={q.max}
            value={text}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <span className="num faint">{text.length} / {q.max}</span>
        </div>
      ) : (
        <input ref={input} className="field" maxLength={120} placeholder={q.placeholder} value={text} onChange={(e) => onChange(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} />
      )}
    </>
  );
}
