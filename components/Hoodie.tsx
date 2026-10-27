"use client";

import type { AvatarDefinition } from "@bible-strong/avatar-core";
import { Avatar, type AvatarController } from "@bible-strong/avatar-react";
import "@bible-strong/avatar-react/styles.css";
import { useEffect, useId, useMemo, useRef, type CSSProperties } from "react";

import base from "@/lib/avatar/hoodiebot.avatar.json";
import { TEAM, type Member } from "@/lib/team";

import s from "./Hoodie.module.css";

/** What the bot is doing, mapped onto the avatar's animations. */
export type Mood = "idle" | "listening" | "thinking" | "searching" | "working" | "happy" | "suspicious" | "sleeping" | "celebrate" | "sad";

type Expression = AvatarDefinition["expressions"][string];

/** A 5×3 grid of gaze expressions derived from neutral: head turns and eyes slide toward each cell. */
const GAZE_X = [-2, -1, 0, 1, 2];
const GAZE_Y = [-1, 0, 1];
const gazeKey = (x: number, y: number) => `look-x${x + 2}-y${y + 1}`;

function withGaze(def: AvatarDefinition): AvatarDefinition {
  const neutral = def.expressions.neutral!;
  const looks: Record<string, Expression> = {};
  for (const x of GAZE_X) {
    for (const y of GAZE_Y) {
      const eye = (e: Expression["eyes"]["left"]) => ({ ...e, x: e.x + x * 7, y: e.y + y * 9 });
      // head.y turns left/right, head.x tips up (+) and down (-), head.z leans into the turn
      looks[gazeKey(x, y)] = {
        ...neutral,
        head: { x: -y * 11, y: x * 13, z: -x * 3 },
        eyes: { ...neutral.eyes, left: eye(neutral.eyes.left), right: eye(neutral.eyes.right) },
        motion: { eyes: "microSaccades", body: "slowDrift" },
      };
    }
  }
  return { ...def, expressions: { ...def.expressions, ...looks }, expressionOrder: [...def.expressionOrder, ...Object.keys(looks)] };
}

const definitions = new Map<Member, AvatarDefinition>();
function definition(member: Member): AvatarDefinition {
  let d = definitions.get(member);
  if (!d) {
    d = withGaze({ ...(base as unknown as AvatarDefinition), colors: { body: base.colors.body as `#${string}`, eyes: TEAM[member].eyes } });
    definitions.set(member, d);
  }
  return d;
}

const FOLLOW_RADIUS = 900;
const RETURN_MS = 2200;

/**
 * The hooded bot. It breathes, looks toward the pointer when it is near, grins when hovered, and falls back to its
 * mood animation when the pointer rests. `still` holds one expression (brand images) and turns all of that off.
 */
export function Hoodie({ member = "hoodiebot", mood = "idle", size = 96, label, still }: { member?: Member; mood?: Mood; size?: number | string; label?: string; still?: string }) {
  const d = useMemo(() => definition(member), [member]);
  const name = label ?? TEAM[member].name;
  const wrap = useRef<HTMLSpanElement>(null);
  const avatar = useRef<AvatarController>(null);
  // a different breathing phase per instance, so a row of bots never moves in lockstep (from useId: same on server and client)
  const id = useId();
  const phase = useMemo(() => ({ ["--hoodie-delay" as string]: `${-([...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 7) % 42) / 10}s` }) as CSSProperties, [id]);

  useEffect(() => {
    if (still || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let current = "", frame = 0, back = 0, hovering = false;
    const rest = () => {
      current = "";
      avatar.current?.play(mood);
    };
    const look = (e: PointerEvent) => {
      if (frame || hovering) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const r = wrap.current?.getBoundingClientRect();
        if (!r || !r.width) return;
        const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        if (Math.hypot(dx, dy) > FOLLOW_RADIUS) return;
        const reach = Math.max(160, r.width * 1.6);
        const key = gazeKey(Math.round(Math.max(-2, Math.min(2, dx / reach))), Math.round(Math.max(-1, Math.min(1, dy / reach))));
        if (key !== current) {
          current = key;
          avatar.current?.setExpression(key);
        }
        clearTimeout(back);
        back = window.setTimeout(rest, RETURN_MS);
      });
    };
    const enter = () => {
      hovering = true;
      clearTimeout(back);
      avatar.current?.play("happy");
    };
    const leave = () => {
      hovering = false;
      back = window.setTimeout(rest, 600);
    };
    const el = wrap.current;
    window.addEventListener("pointermove", look, { passive: true });
    el?.addEventListener("pointerenter", enter);
    el?.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(back);
      window.removeEventListener("pointermove", look);
      el?.removeEventListener("pointerenter", enter);
      el?.removeEventListener("pointerleave", leave);
    };
  }, [mood, still]);

  if (still) return <Avatar key={`${member}:${still}`} definition={d} defaultExpression={still} size={size} ariaLabel={name} />;
  return (
    <span ref={wrap} className={s.hoodie} style={phase}>
      <Avatar ref={avatar} key={`${member}:${mood}`} definition={d} defaultAnimation={mood} size={size} ariaLabel={name} />
    </span>
  );
}
