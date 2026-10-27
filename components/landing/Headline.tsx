"use client";

import { Fragment, useEffect, useRef, useState } from "react";

/** Words between asterisks get the gradient. Screen readers only hear the first line. */
const LINES = [
  "Your private trading team on *Robinhood Chain*",
  "Watch every *Pons launch* while you sleep",
  "Research the token *before* the entry",
  "Trade *inside your rules*, not your mood",
  "Approve the trade *from your phone*",
];

function Line({ text, on }: { text: string; on: boolean }) {
  let accent = false;
  return (
    <span className="hl-line" data-on={on || undefined}>
      {text.split(" ").map((word, i) => {
        const start = word.startsWith("*"), end = word.replace(/[,.]$/, "").endsWith("*");
        if (start) accent = true;
        const clean = word.replace(/\*/g, "");
        const el = <Fragment key={i}><span className={`hl-w${accent ? " grad" : ""}`}>{clean}</span>{" "}</Fragment>;
        if (end) accent = false;
        return el;
      })}
    </span>
  );
}

export function Headline({ className }: { className?: string }) {
  const [i, setI] = useState(0);
  const root = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let timer = 0;
    const tick = async () => {
      if (document.hidden) return void (timer = window.setTimeout(tick, 2600));
      const words = root.current?.querySelectorAll<HTMLElement>("[data-on] .hl-w") ?? [];
      await Promise.all([...words].map((w, k) => w.animate(reduce ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, filter: "blur(0)", transform: "none" }, { opacity: 0, filter: "blur(6px)", transform: "translateY(-6px)" }], { duration: 260, delay: reduce ? 0 : k * 28, easing: "ease-in", fill: "forwards" }).finished.catch(() => {})));
      setI((n) => (n + 1) % LINES.length);
      timer = window.setTimeout(tick, 2900);
    };
    timer = window.setTimeout(tick, 3200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    root.current?.querySelectorAll<HTMLElement>("[data-on] .hl-w").forEach((w, k) => {
      w.getAnimations().forEach((a) => a.cancel());
      if (i === 0 && !w.dataset.seen) return void (w.dataset.seen = "1");
      w.animate(reduce ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, filter: "blur(8px)", transform: "translateY(8px)" }, { opacity: 1, filter: "blur(0)", transform: "none" }], { duration: 420, delay: reduce ? 0 : k * 40, easing: "cubic-bezier(.2,.7,.2,1)", fill: "backwards" });
    });
  }, [i]);

  return (
    <h1 className={className}>
      <span className="sr-only">{LINES[0]!.replace(/\*/g, "")}</span>
      <span ref={root} className="hl" aria-hidden="true">
        {LINES.map((l, k) => <Line key={k} text={l} on={k === i} />)}
      </span>
    </h1>
  );
}
