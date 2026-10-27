"use client";

import { useEffect, useRef } from "react";

import { createField, TONES } from "@/lib/field";

import s from "./Field.module.css";

/** Talk to the field from anywhere: fieldEvent("typing") as the user types, "pulse" on send, "tone:hunt" etc. */
export const fieldEvent = (name: "typing" | "pulse" | `tone:${keyof typeof TONES}`) => window.dispatchEvent(new CustomEvent("hb:field", { detail: name }));

/** The ASCII layer behind a page. Bots lean toward `targetId` (the composer) while the user types. */
export function Field({ targetId }: { targetId?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const h = host.current!, c = canvas.current!;
    const font = getComputedStyle(document.documentElement).getPropertyValue("--font-mono") || "monospace";
    const field = createField(h, c, font);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const layout = () => {
      field.resize();
      const t = targetId ? document.getElementById(targetId)?.getBoundingClientRect() : null;
      const r = h.getBoundingClientRect();
      if (t) field.setTarget(t.left - r.left + t.width / 2, t.top - r.top + t.height / 2);
    };
    const onMove = (e: PointerEvent) => {
      const r = h.getBoundingClientRect();
      field.setPointer(e.clientX - r.left, e.clientY - r.top);
    };
    const onLeave = () => field.setPointer(-1e5, -1e5);
    const onEvent = (e: Event) => {
      const name = (e as CustomEvent<string>).detail;
      if (name === "typing") field.typing();
      else if (name === "pulse") field.pulse();
      else if (name.startsWith("tone:")) field.setTone(TONES[name.slice(5) as keyof typeof TONES] ?? TONES.calm);
    };
    const onMotion = () => field.setPlaying(!reduce.matches);
    const ro = new ResizeObserver(layout);
    ro.observe(h);
    layout();
    onMotion();
    document.fonts?.ready.then(() => field.redraw()).catch(() => {});
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    window.addEventListener("hb:field", onEvent);
    reduce.addEventListener("change", onMotion);
    return () => {
      ro.disconnect();
      field.destroy();
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("hb:field", onEvent);
      reduce.removeEventListener("change", onMotion);
    };
  }, [targetId]);

  return (
    <div ref={host} className={s.field} aria-hidden="true">
      <canvas ref={canvas} />
    </div>
  );
}
