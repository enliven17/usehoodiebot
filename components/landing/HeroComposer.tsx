"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { fieldEvent } from "@/components/Field";
import { Hoodie } from "@/components/Hoodie";

import s from "./landing.module.css";

const CHIPS = [
  ["research", "Research the busiest Pons token right now"],
  ["watch", "Watch new Pons launches under $60k market cap with 5k liquidity"],
  ["strategy", "Set a strategy: buy 0.01 ETH of fresh launches that pass research, ask me first"],
  ["launch", "Help me launch a token on Pons"],
] as const;

export function HeroComposer() {
  const router = useRouter();
  const [text, setText] = useState("");
  const go = (q: string) => {
    fieldEvent("pulse");
    router.push(`/app${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`);
  };
  return (
    <>
      <form
        id="composer"
        className={s.composer}
        data-intro
        onSubmit={(e) => {
          e.preventDefault();
          go(text);
        }}
      >
        <label htmlFor="prompt" className="sr-only">Tell Hoodie what to do</label>
        <textarea
          id="prompt"
          rows={2}
          value={text}
          placeholder="Tell Hoodie what to watch…"
          onChange={(e) => {
            setText(e.target.value);
            fieldEvent("typing");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              go(text);
            }
          }}
        />
        <div className={s.toolbar}>
          <span className={s.who}>
            <Hoodie size={28} mood={text ? "listening" : "idle"} />
            Hoodie · Robinhood Chain
          </span>
          <button type="submit" className={s.send} data-ready={text.trim() ? "" : undefined} aria-label="Send to Hoodie">
            <svg className="i" viewBox="0 0 24 24"><path d="M7 7h10v10" /><path d="M7 17 17 7" /></svg>
          </button>
        </div>
      </form>
      <ul className={s.chips} data-intro>
        {CHIPS.map(([k, q]) => (
          <li key={k}>
            <button type="button" className="chip" onClick={() => go(q)}>
              <span className="slash">/</span>{k}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
