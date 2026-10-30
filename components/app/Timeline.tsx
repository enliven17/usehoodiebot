"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { addressUrl, txUrl } from "@/lib/chain/robinhood-urls";
import { ago } from "@/lib/format";
import { TEAM, type Member } from "@/lib/team";

import type { Snapshot } from "./api";
import s from "./app.module.css";

const ethOf = (wei: string) => {
  const n = Number(BigInt(wei)) / 1e18;
  return `${n > 0 ? "+" : ""}${n.toFixed(4)} ETH`;
};

/**
 * What the team decided and did, newest first: each specialist in its own colour, what it saw, what it asked, what it
 * bought and sold, with the ETH that moved and the transaction behind it.
 */
export function Timeline({ snap, onOpen }: { snap: Snapshot; onOpen?: (pick: { token: string; symbol: string }) => void }) {
  const reduce = useReducedMotion();
  return (
    <section className={s.block} aria-labelledby="tl-h">
      <h2 id="tl-h" className={s.blockTitle}>Decisions</h2>
      {!snap.events.length ? (
        <p className="faint" style={{ fontSize: 14, margin: 0 }}>Nothing yet. Every scan, match, ask, buy and sell your team makes shows up here.</p>
      ) : (
        <ol className={s.timeline}>
          <AnimatePresence initial={false}>
            {snap.events.map((e) => {
              const m = TEAM[e.member as Member] ?? TEAM.hoodiebot;
              return (
                <motion.li
                  key={e.id}
                  layout={!reduce}
                  initial={reduce ? false : { opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, ease: [0.2, 0.7, 0.2, 1] }}
                  className={s.event}
                  data-kind={e.kind}
                  style={{ ["--eye" as string]: m.eyes }}
                >
                  <span className={s.eventMark} aria-hidden />
                  <div className={s.eventBody}>
                    <p className={s.eventHead}>
                      <strong>{m.name}</strong>
                      <time className="faint" dateTime={new Date(e.at).toISOString()}>{ago(e.at)}</time>
                    </p>
                    <p className={s.eventText}>{e.text}</p>
                    {e.wei || e.hash || e.token ? (
                      <p className={s.eventMeta}>
                        {e.wei ? <span className={`num ${BigInt(e.wei) >= 0n ? "up" : "down"}`}>{ethOf(e.wei)}</span> : null}
                        {e.hash && txUrl(e.hash) ? <a className="num" href={txUrl(e.hash)} target="_blank" rel="noopener">tx</a> : null}
                        {e.token ? onOpen ? <button type="button" className={s.linkish} onClick={() => onOpen({ token: e.token!, symbol: e.symbol ?? `${e.token!.slice(0, 6)}…${e.token!.slice(-4)}` })}>{e.symbol ?? "Token"} · Open chart →</button> : <a className="num" href={addressUrl(e.token)} target="_blank" rel="noopener">{e.symbol ?? "token"}</a> : null}
                      </p>
                    ) : null}
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ol>
      )}
    </section>
  );
}
