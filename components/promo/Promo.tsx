"use client";

/**
 * The launch video, played once in a 1920×1080 frame and recorded by brand/promo.mjs. Development only. Six scenes,
 * little text: who Hoodie is, the team, a trade from chat, ShieldBot saying no, Autopilot, and the way in.
 */
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

import { Field } from "@/components/Field";
import { Hoodie } from "@/components/Hoodie";
import { Mark } from "@/components/Logo";
import { MEMBERS, TEAM } from "@/lib/team";

import s from "./promo.module.css";

const EASE = [0.2, 0.7, 0.2, 1] as const;
/** How long each scene holds, in ms. */
const SCENES = [3400, 4000, 7600, 4200, 4600, 3800] as const;
const enter = { initial: { opacity: 0, y: 24, filter: "blur(8px)" }, animate: { opacity: 1, y: 0, filter: "blur(0px)" }, exit: { opacity: 0, y: -16, filter: "blur(8px)" }, transition: { duration: 0.7, ease: EASE } };

export function Promo() {
  const [scene, setScene] = useState(-1);

  // starts when the recorder asks (?play), so the first frame of the file is the first frame of the film
  useEffect(() => {
    const start = () => setScene(0);
    if (new URLSearchParams(location.search).has("play")) {
      const t = setTimeout(start, 600);
      return () => clearTimeout(t);
    }
    (window as unknown as { promoStart: () => void }).promoStart = start;
  }, []);
  useEffect(() => {
    if (scene < 0) return;
    if (scene >= SCENES.length) return void ((window as unknown as { promoDone: boolean }).promoDone = true);
    const t = setTimeout(() => setScene(scene + 1), SCENES[scene]);
    return () => clearTimeout(t);
  }, [scene]);

  return (
    <div className={s.frame}>
      <div className={s.field}><Field /></div>
      <div className={s.vignette} aria-hidden />
      <AnimatePresence mode="wait">
        {scene === 0 ? <Intro key="intro" /> : null}
        {scene === 1 ? <Team key="team" /> : null}
        {scene === 2 ? <ChatTrade key="chat" /> : null}
        {scene === 3 ? <Shield key="shield" /> : null}
        {scene === 4 ? <Autopilot key="auto" /> : null}
        {scene >= 5 ? <Outro key="outro" /> : null}
      </AnimatePresence>
    </div>
  );
}

function Intro() {
  return (
    <motion.section className={s.center} {...enter}>
      <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", duration: 0.9, bounce: 0.35 }}>
        <Hoodie size={260} mood="celebrate" />
      </motion.div>
      <motion.h1 className={s.hero} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 0.7, ease: EASE }}>
        Your trading team<span className="grad">.</span>
      </motion.h1>
      <motion.p className={s.sub} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9, duration: 0.6 }}>On Robinhood Chain.</motion.p>
    </motion.section>
  );
}

function Team() {
  return (
    <motion.section className={s.center} {...enter}>
      <ul className={s.row}>
        {MEMBERS.map((m, i) => (
          <motion.li key={m} initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.16, type: "spring", duration: 0.8, bounce: 0.3 }}>
            <Hoodie member={m} size={m === "hoodiebot" ? 200 : 168} mood={m === "shield" ? "suspicious" : m === "research" ? "searching" : m === "trader" ? "working" : m === "sniper" ? "suspicious" : "idle"} />
            <span style={{ color: TEAM[m].eyes }}>{TEAM[m].name}</span>
          </motion.li>
        ))}
      </ul>
      <motion.h2 className={s.title} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4, duration: 0.6 }}>Six specialists. One hood.</motion.h2>
    </motion.section>
  );
}

/** Text that types itself out. */
function Typed({ text, delay = 0, speed = 45 }: { text: string; delay?: number; speed?: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let i = 0;
    let t: ReturnType<typeof setInterval>;
    const d = setTimeout(() => (t = setInterval(() => (i < text.length ? setN(++i) : clearInterval(t)), speed)), delay);
    return () => (clearTimeout(d), clearInterval(t));
  }, [text, delay, speed]);
  return <>{text.slice(0, n)}</>;
}

function ChatTrade() {
  const [pressed, setPressed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setPressed(true), 5600);
    return () => clearTimeout(t);
  }, []);
  const steps = [["research", "ResearchBot looked the token up"], ["shield", "ShieldBot checked it"], ["trader", "TraderBot laid out the trade"]] as const;
  return (
    <motion.section className={s.chat} {...enter}>
      <h2 className={s.kicker}>Trade by just saying it.</h2>
      <div className={s.me}><Typed text="buy 0.02 eth of LODGER" delay={500} /></div>
      <div className={s.bot}>
        <Hoodie size={64} mood={pressed ? "happy" : "working"} />
        <div className={s.botBody}>
          <p className={s.steps}>
            {steps.map(([m, label], i) => (
              <motion.span key={m} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.8 + i * 0.45 }} style={{ ["--eye" as string]: TEAM[m].eyes }}>{label}</motion.span>
            ))}
          </p>
          <motion.div className={s.card} initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 3.4, duration: 0.6, ease: EASE }}>
            <div className={s.cardHead}><span className={s.buy}>Buy</span><strong>$LODGER</strong><span className="faint">Pons curve</span></div>
            <dl className={s.facts}>
              <div><dt>You pay</dt><dd className="num">0.02 ETH</dd></div>
              <div><dt>You get</dt><dd className="num">1.19M LODGER</dd></div>
              <div><dt>ShieldBot</dt><dd className="num">85/100</dd></div>
            </dl>
            <motion.div className={s.press} animate={pressed ? { scale: [1, 0.96, 1] } : {}} transition={{ duration: 0.35 }}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.span key={pressed ? "done" : "buy"} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
                  {pressed ? "Bought ✓" : "Buy LODGER"}
                </motion.span>
              </AnimatePresence>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </motion.section>
  );
}

function Shield() {
  return (
    <motion.section className={s.center} {...enter}>
      <Hoodie member="shield" size={220} mood="suspicious" />
      <motion.div className={s.block} initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.5, duration: 0.5, ease: EASE }}>
        <span className={s.blocked}>Blocked</span>
        <span>The creator still holds <strong className="num">31%</strong> of the supply.</span>
      </motion.div>
      <motion.h2 className={s.title} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.3, duration: 0.6 }}>ShieldBot checks every token first.</motion.h2>
    </motion.section>
  );
}

function Autopilot() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setOn(true), 900);
    return () => clearTimeout(t);
  }, []);
  return (
    <motion.section className={s.center} {...enter}>
      <div className={s.auto} data-on={on || undefined}>
        <div className={s.autoHead}>
          <strong>Autopilot</strong>
          <div className={s.toggle}><motion.span layout transition={{ type: "spring", duration: 0.5, bounce: 0.3 }} /></div>
        </div>
        <div className={s.meter}><motion.span initial={{ width: "0%" }} animate={{ width: on ? "62%" : "0%" }} transition={{ duration: 1.6, delay: 0.3, ease: EASE }} /></div>
        <p className="num faint">0.124 of 0.2 ETH at work</p>
      </div>
      <ul className={s.presets}>
        {["Launch Sniper", "Momentum Rider", "Graduation Hunter"].map((p, i) => (
          <motion.li key={p} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.6 + i * 0.2 }}>{p}</motion.li>
        ))}
      </ul>
      <motion.h2 className={s.title} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.3, duration: 0.6 }}>Inside a budget you set.</motion.h2>
    </motion.section>
  );
}

function Outro() {
  return (
    <motion.section className={s.center} {...enter}>
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", duration: 0.9, bounce: 0.3 }}>
        <span className={s.wordmark}><Mark size={112} />hoodiebot</span>
      </motion.div>
      <motion.p className={s.cta} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, duration: 0.6 }}>
        Apply for access
      </motion.p>
    </motion.section>
  );
}
