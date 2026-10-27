"use client";

import { motion, useReducedMotion } from "motion/react";

import { Hoodie } from "@/components/Hoodie";
import { blocks, type Span } from "@/lib/rich";
import { TEAM, type Member } from "@/lib/team";

import type { Line } from "./api";
import s from "./app.module.css";

const STEP_LABEL: Record<string, string> = {
  scan_market: "scanned the market", research_token: "read the token", get_wallet: "checked the wallet", propose_trade: "prepared a trade",
  create_strategy: "saved a strategy", list_strategies: "read your strategies", update_strategy: "updated a strategy", prepare_launch: "checked the launch",
};

const Spans = ({ spans }: { spans: Span[] }) => (
  <>{spans.map((sp, i) => (sp.bold ? <strong key={i}>{sp.text}</strong> : sp.code ? <code key={i} className={s.code}>{sp.text}</code> : <span key={i}>{sp.text}</span>))}</>
);

export function Rich({ text }: { text: string }) {
  return (
    <>
      {blocks(text).map((b, i) =>
        b.type === "p" ? (
          <p key={i} className={s.para}><Spans spans={b.spans} /></p>
        ) : (
          <ul key={i} className={s.list2}>{b.items.map((it, j) => <li key={j}><Spans spans={it} /></li>)}</ul>
        ),
      )}
    </>
  );
}

/** One line of the conversation; it rises in softly the first time it renders. */
export function Message({ line }: { line: Line }) {
  const reduce = useReducedMotion();
  const enter = reduce ? {} : { initial: { opacity: 0, y: 10, filter: "blur(4px)" }, animate: { opacity: 1, y: 0, filter: "blur(0px)" }, transition: { duration: 0.35, ease: [0.2, 0.7, 0.2, 1] as const } };
  if (line.who === "me") {
    return (
      <motion.div className={`${s.msg} ${s.me}`} {...enter}>
        <p className={s.bubble}>{line.text}</p>
      </motion.div>
    );
  }
  const members = [...new Set(line.steps.map((st) => st.member))] as Member[];
  const lead = members.find((m) => m !== "hoodiebot") ?? "hoodiebot";
  return (
    <motion.div className={s.msg} {...enter}>
      <Hoodie member={lead} size={34} mood="idle" />
      <div className={s.bubble}>
        {line.steps.length ? (
          <p className={s.toolSteps}>
            {line.steps.map((st, i) => (
              <span key={i} className={s.stepChip} style={{ ["--eye" as string]: TEAM[st.member as Member]?.eyes ?? TEAM.hoodiebot.eyes }}>
                {TEAM[st.member as Member]?.name ?? "Hoodie"} {STEP_LABEL[st.tool] ?? st.tool}
              </span>
            ))}
          </p>
        ) : null}
        <Rich text={line.text} />
      </div>
    </motion.div>
  );
}
