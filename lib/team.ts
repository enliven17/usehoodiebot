/** The team: one hooded bot, five jobs. Each specialist is HOODIEBOT with its own eye colour. */
export const TEAM = {
  hoodiebot: { name: "HOODIEBOT", eyes: "#7ce8f2", job: "Routes the work and asks you when it matters." },
  research: { name: "ResearchBot", eyes: "#b9a6ff", job: "Reads the Pons tape: holders, curve, volume, who is buying." },
  sniper: { name: "SniperBot", eyes: "#fca5a5", job: "Watches your entries and fires the moment one matches." },
  trader: { name: "TraderBot", eyes: "#9fe8b5", job: "Trades inside your rules, from the agent's own wallet." },
  launch: { name: "LaunchBot", eyes: "#fcd38d", job: "Prepares and launches a token on Pons." },
} as const;

export type Member = keyof typeof TEAM;
export const MEMBERS = Object.keys(TEAM) as Member[];
