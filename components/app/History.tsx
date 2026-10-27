"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

import { ago } from "@/lib/format";

import { api, type Chat } from "./api";
import s from "./app.module.css";

/** Past chats, newest first. Opening one carries the conversation on from where it stopped. */
export function History({ onOpen, onNew }: { onOpen: (thread: number) => void; onNew: () => void }) {
  const [chats, setChats] = useState<Chat[] | null>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    api.chats().then((r) => setChats(r.threads)).catch(() => setChats([]));
  }, []);

  return (
    <div className={s.history}>
      <div className={s.historyHead}>
        <h1 className={s.pageTitle}>Chats</h1>
        <button type="button" className="btn" onClick={onNew}>New chat</button>
      </div>
      {chats === null ? (
        <div aria-hidden>{[0, 1, 2].map((i) => <div key={i} className={`${s.chatRow} ${s.skeleton}`} style={{ height: 58, animationDelay: `${i * 120}ms` }} />)}</div>
      ) : !chats.length ? (
        <p className="faint" style={{ fontSize: 14 }}>No chats yet. Everything you ask the team is kept here.</p>
      ) : (
        <ul className={s.chatList}>
          {chats.map((c, i) => (
            <motion.li key={c.thread} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: Math.min(i, 10) * 0.025 }}>
              <button type="button" className={s.chatRow} aria-current={c.open ? "true" : undefined} onClick={() => onOpen(c.thread)}>
                <span className={s.chatTitle}>{c.title}</span>
                <time className="num faint" dateTime={new Date(c.at).toISOString()}>{ago(c.at)}</time>
              </button>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}
