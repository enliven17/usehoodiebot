"use client";

import type { AvatarDefinition } from "@bible-strong/avatar-core";
import { Avatar } from "@bible-strong/avatar-react";
import "@bible-strong/avatar-react/styles.css";
import { useMemo } from "react";

import base from "@/lib/avatar/hoodiebot.avatar.json";
import { TEAM, type Member } from "@/lib/team";

/** What the bot is doing, mapped onto the avatar's animations. */
export type Mood = "idle" | "listening" | "thinking" | "searching" | "working" | "happy" | "suspicious" | "sleeping" | "celebrate" | "sad";

const definitions = new Map<Member, AvatarDefinition>();
function definition(member: Member): AvatarDefinition {
  let d = definitions.get(member);
  if (!d) {
    d = { ...(base as unknown as AvatarDefinition), colors: { body: base.colors.body as `#${string}`, eyes: TEAM[member].eyes } };
    definitions.set(member, d);
  }
  return d;
}

export function Hoodie({ member = "hoodiebot", mood = "idle", size = 96, label }: { member?: Member; mood?: Mood; size?: number | string; label?: string }) {
  const d = useMemo(() => definition(member), [member]);
  return <Avatar key={`${member}:${mood}`} definition={d} defaultAnimation={mood} size={size} ariaLabel={label ?? TEAM[member].name} />;
}
