"use client";

// From the portfolio registry (registry/components/status-button): idle, then a spinner while the click's promise runs,
// then a check. Rejecting the promise returns it to idle. Uncontrolled only; Kurage .btn styles instead of Tailwind.
import { AnimatePresence, motion, useReducedMotion, type Transition, type Variants } from "motion/react";
import { useEffect, useState, type ComponentProps, type MouseEvent, type ReactNode } from "react";

import s from "./StatusButton.module.css";

type Status = "idle" | "loading" | "success";

const swap: Variants = { initial: { opacity: 0, y: 8, filter: "blur(4px)" }, animate: { opacity: 1, y: 0, filter: "blur(0px)" }, exit: { opacity: 0, y: -8, filter: "blur(4px)" } };
const fade: Variants = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };
// A spring keeps its velocity when the status changes mid-swap.
const spring: Transition = { type: "spring", duration: 0.3, bounce: 0 };
// Bounce only on the entrance, and only on movement.
const pop: Variants = { ...swap, animate: { ...swap.animate, transition: { type: "spring", duration: 0.45, bounce: 0.35, opacity: spring, filter: spring } } };

type Props = Omit<ComponentProps<"button">, "onClick" | "children"> & { children: ReactNode; onClick: (e: MouseEvent<HTMLButtonElement>) => Promise<void>; successLabel?: ReactNode };

export function StatusButton({ children, onClick, successLabel, className, ...props }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const reduce = useReducedMotion();
  useEffect(() => {
    if (status !== "success") return;
    const t = window.setTimeout(() => setStatus("idle"), 1500);
    return () => window.clearTimeout(t);
  }, [status]);

  const busy = status !== "idle";
  const variants = reduce ? fade : swap;
  const transition = reduce ? { duration: 0 } : spring;
  const success = (
    <>
      <svg className="i i-sm" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5" /></svg>
      {successLabel ?? <span className="sr-only">Done</span>}
    </>
  );

  return (
    <button
      type="button"
      {...props}
      className={`${className ?? "btn"} ${s.root}`}
      data-status={status}
      aria-busy={status === "loading"}
      // Not `disabled`: busy keeps focus and the normal look; presses are ignored meanwhile.
      aria-disabled={busy || undefined}
      onClick={async (e) => {
        if (busy) return e.preventDefault();
        setStatus("loading");
        try {
          await onClick(e);
          setStatus("success");
        } catch {
          setStatus("idle");
        }
      }}
    >
      {/* Invisible copies of the widest states keep the width fixed. */}
      <span aria-hidden className={s.ghost}>{children}</span>
      <span aria-hidden className={s.ghost}>{success}</span>
      <AnimatePresence initial={false}>
        {status === "idle" && <motion.span key="idle" className={s.layer} variants={variants} initial="initial" animate="animate" exit="exit" transition={transition}>{children}</motion.span>}
        {status === "loading" && (
          <motion.span key="loading" role="status" className={s.layer} variants={variants} initial="initial" animate="animate" exit="exit" transition={transition}>
            <Spinner />
            <span className="sr-only">Working</span>
          </motion.span>
        )}
        {status === "success" && <motion.span key="success" role="status" className={s.layer} variants={reduce ? variants : pop} initial="initial" animate="animate" exit="exit" transition={transition}>{success}</motion.span>}
      </AnimatePresence>
    </button>
  );
}

function Spinner() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="currentColor" className={s.spinner}>
      {Array.from({ length: 10 }, (_, i) => (
        <rect key={i} x="11.84" y="7.25" width="4" height="1.5" rx="0.75" transform={i ? `rotate(${i * 36} 8 8)` : undefined} style={{ animationDelay: `${-900 + i * 100}ms` }} />
      ))}
    </svg>
  );
}
