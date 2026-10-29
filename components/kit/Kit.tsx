import type { CSSProperties, ReactNode } from "react";

import { Field } from "@/components/Field";
import { Hoodie } from "@/components/Hoodie";
import { Mark } from "@/components/Logo";
import { MEMBERS, TEAM } from "@/lib/team";

import s from "./kit.module.css";

/** Every brand image: its pixel size and what it shows. brand/render.mjs screenshots each at exactly this size. */
export const KITS = {
  "x-profile": { w: 800, h: 800 },
  "x-banner": { w: 1500, h: 500 },
  "mark-tile": { w: 1024, h: 1024 },
  og: { w: 1200, h: 630 },
  "og-litepaper": { w: 1200, h: 630 },
  "og-app": { w: 1200, h: 630 },
  "post-intro": { w: 1600, h: 900 },
  "post-wallet": { w: 1600, h: 900 },
  "post-what": { w: 1600, h: 900 },
  "kit-logo": { w: 1600, h: 900 },
  "kit-colour": { w: 1600, h: 900 },
  "kit-type": { w: 1600, h: 900 },
} as const;

type Name = keyof typeof KITS;

const Word = ({ size }: { size: number }) => (
  <span className={s.word} style={{ fontSize: size }}>
    <Mark size={size * 1.15} />
    hoodiebot
  </span>
);

const Team = ({ size, gap = 6 }: { size: number; gap?: number }) => (
  <div className={s.team} style={{ gap }}>
    {(["research", "sniper", "hoodiebot", "trader", "launch"] as const).map((m) => <Hoodie key={m} member={m} size={m === "hoodiebot" ? size * 1.4 : size} still={m === "hoodiebot" ? "neutral" : m === "research" ? "curious-left" : m === "sniper" ? "suspicious-right" : m === "trader" ? "attentive-left" : "joyful-wide"} />)}
  </div>
);

const SWATCHES: Array<[string, string, string]> = [
  ["Ink", "#04060A", "the ground of everything"],
  ["Panel", "#0A0E15", "cards, the rail, wells"],
  ["Mist", "#F1F4F8", "text"],
  ["Mist 400", "#9AA4B4", "secondary text"],
  ["Cyan", "#7CE8F2", "Hoodie, focus, the one thing to look at"],
  ["Violet", "#B9A6FF", "ResearchBot, the far end of the gradient"],
  ["Red", "#FCA5A5", "SniperBot, losses, errors"],
  ["Green", "#9FE8B5", "TraderBot, gains"],
  ["Amber", "#FCD38D", "LaunchBot"],
];

function body(name: Name): ReactNode {
  switch (name) {
    case "x-profile":
      return <div className={s.center}><div className={s.glow} /><div className={s.lift}><Hoodie size={540} still="neutral" /></div></div>;
    case "mark-tile":
      return <div className={s.center}><div className={s.tile}><Mark size={560} /></div></div>;
    case "x-banner":
      return (
        <div className={s.banner}>
          <Field />
          <div className={s.bannerText}>
            <Word size={44} />
            <p className={s.bannerLine}>Your private trading team on <span className="grad">Robinhood Chain</span></p>
          </div>
          <Team size={92} />
        </div>
      );
    case "og":
    case "og-litepaper":
    case "og-app": {
      const title = name === "og" ? <>Your private trading team on <span className="grad">Robinhood Chain</span></> : name === "og-litepaper" ? <>How the <span className="grad">team</span> works</> : <>Tell it what to <span className="grad">watch</span></>;
      const sub = name === "og" ? "Research, entries and trades on Pons, inside your rules." : name === "og-litepaper" ? "Litepaper · specialists, strategies, the wallet and its policy" : "Chat, approvals, strategies and a wallet only you can withdraw from";
      return (
        <div className={s.og}>
          <Field />
          <div className={s.ogHalo} />
          <Word size={30} />
          <h1 className={s.ogTitle}>{title}</h1>
          <p className={s.ogSub}>{sub}</p>
          <Team size={78} />
          <span className={s.ogUrl}>usehoodiebot.com</span>
        </div>
      );
    }
    case "post-intro":
      return (
        <div className={s.post}>
          <Field />
          <h1 className={s.postTitle}>Five specialists. <span className="grad">One hood.</span></h1>
          <div className={s.cards}>
            {MEMBERS.map((m) => (
              <div key={m} className={s.card}>
                <Hoodie member={m} size={150} still="neutral" />
                <strong>{TEAM[m].name}</strong>
                <span>{TEAM[m].job}</span>
              </div>
            ))}
          </div>
          <span className={s.postFoot}><Mark size={22} /> usehoodiebot.com</span>
        </div>
      );
    case "post-wallet":
      return (
        <div className={s.post}>
          <Field />
          <h1 className={s.postTitle}>Its own wallet, on a <span className="grad">short leash.</span></h1>
          <div className={s.rules}>
            {[
              ["Deny by default", "Pons curves, the Uniswap v4 router and Permit2 on chain 4663. Everything else is refused before it is signed."],
              ["Withdrawals go to you", "ETH can only leave to the address that owns the team."],
              ["Fills from the chain", "Positions are booked from the receipt, never from a quote."],
            ].map(([h, p]) => (
              <div key={h} className={s.rule}><strong>{h}</strong><span>{p}</span></div>
            ))}
          </div>
          <Team size={70} />
        </div>
      );
    case "post-what":
      return (
        <div className={s.what}>
          <Field />
          <div className={s.whatHero}><div className={s.glow} /><div className={s.lift}><Hoodie size={420} still="neutral" /></div></div>
          <div className={s.whatText}>
            <h1 className={s.whatTitle}>Hoodie is your own <span className="grad">trading team.</span></h1>
            <div className={s.steps}>
              {[
                ["Say it in plain words", "Ask what is moving. It researches and brings you a trade to approve."],
                ["Checked before money goes in", "ShieldBot reads the creator, the holders and split buys, and blocks honeypots."],
                ["Trades inside your budget", "Autopilot works only within the limit you set, from a wallet only you withdraw from."],
              ].map(([h, p]) => (
                <div key={h} className={s.step}><strong>{h}</strong><span>{p}</span></div>
              ))}
            </div>
            <div className={s.whatTeam}>{MEMBERS.map((m) => <Hoodie key={m} member={m} size={54} still="neutral" />)}</div>
          </div>
        </div>
      );
    case "kit-logo":
      return (
        <div className={s.sheet}>
          <h2 className={s.sheetTitle}>Logo</h2>
          <div className={s.logoRow}>
            <div className={s.logoCell}><Mark size={220} /><span>Mark, gradient</span></div>
            <div className={s.logoCell}><div className={s.tile} style={{ width: 220, height: 220, borderRadius: 52 }}><Mark size={130} /></div><span>Tile, app icon</span></div>
            <div className={s.logoCell}><Hoodie size={220} still="neutral" /><span>Hoodie, the character</span></div>
          </div>
          <div className={s.logoRow}><Word size={64} /></div>
          <div className={s.logoRow}>{[64, 32, 16].map((n) => <Mark key={n} size={n} />)}<span className={s.note}>The face is open: the ground shows through. Never fill it, outline it or recolour the gradient.</span></div>
        </div>
      );
    case "kit-colour":
      return (
        <div className={s.sheet}>
          <h2 className={s.sheetTitle}>Colour</h2>
          <div className={s.swatches}>
            {SWATCHES.map(([n, hex, use]) => (
              <div key={n} className={s.swatch}>
                <span className={s.chip} style={{ background: hex } as CSSProperties} />
                <strong>{n}</strong>
                <code>{hex}</code>
                <span>{use}</span>
              </div>
            ))}
          </div>
          <div className={s.gradBar} />
          <p className={s.note}>Ink carries the page. The cyan to violet gradient appears once per screen: a headline word or the primary button.</p>
        </div>
      );
    case "kit-type":
      return (
        <div className={s.sheet}>
          <h2 className={s.sheetTitle}>Type</h2>
          <p className={s.typeDisplay}>Watch every <span className="grad">Pons launch</span></p>
          <p className={s.typeMeta}>Geist 300 · display · tracking −0.045em · sentence case</p>
          <p className={s.typeBody}>Tell Hoodie what to watch. Its specialists research Pons launches, wait for your entry and trade inside your rules.</p>
          <p className={s.typeMeta}>Geist 400 · body · 17px / 1.55</p>
          <p className={s.typeMono}><span className="slash">/</span>strategy · mcap ≤ $60k · 0.01 ETH · +36.5%</p>
          <p className={s.typeMeta}>Geist Mono · numbers, addresses, chips</p>
        </div>
      );
  }
}

export function KitAsset({ name }: { name: Name }) {
  const { w, h } = KITS[name];
  return <div className={s.frame} style={{ width: w, height: h }} data-kit={name}>{body(name)}</div>;
}
