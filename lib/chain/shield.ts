/**
 * ShieldBot: the safety read on a Pons token before the team puts money in. Two GeckoTerminal calls (token info and the
 * pool's last 300 trades, both cached) feed a pure assessment: hard blocks that no strategy or chat can override, warnings
 * that cost score, and a 0–100 score that strategies use as a bar and to size the entry.
 * Verified 2026-10-27 against live responses: /tokens/{t}/info → holders.count, holders.distribution_percentage.top_10,
 * developer_address, developer_holding_percentage, is_honeypot, gt_score, twitter_handle, telegram_handle, websites;
 * /pools/{p}/trades → data[].attributes {kind, tx_from_address, from_token_amount, to_token_amount, block_timestamp}.
 */
export type TokenInfo = {
  holders?: { count?: number; distribution_percentage?: { top_10?: string } };
  developer_address?: string | null;
  developer_holding_percentage?: string | number | null;
  is_honeypot?: boolean | string | null;
  gt_score?: number | null;
  twitter_handle?: string | null;
  telegram_handle?: string | null;
  websites?: string[] | null;
};
export type Trade = { kind: "buy" | "sell"; from: string; eth: number; tokens: number; at: number };

export type Shield = {
  /** 0–100; 0 when anything blocks */
  score: number;
  /** reasons the team will not buy it */
  blocks: string[];
  /** things that cost score */
  warns: string[];
  facts: {
    holders: number | null;
    top10Pct: number | null;
    devPct: number | null;
    devSells: number;
    buyers: number;
    biggestBuyerPct: number | null;
    sameSizeWallets: number;
    socials: boolean;
  };
};

/** The bars, in one place: the creator holding this much blocks, and so on. */
export const SHIELD = { maxDevPct: 15, sameSizeWallets: 4, warnTop10Pct: 85, warnBiggestBuyerPct: 40, fewBuyers: 5, fewHolders: 40 } as const;

const n = (v: unknown) => {
  const x = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(x) ? x : null;
};
const pct = (x: number) => `${x.toFixed(x < 10 ? 1 : 0)}%`;

/** Pure: the read on one token from its info and recent trades. */
export function assess(info: TokenInfo, trades: Trade[]): Shield {
  const blocks: string[] = [];
  const warns: string[] = [];
  const holders = n(info.holders?.count);
  const top10Pct = n(info.holders?.distribution_percentage?.top_10);
  const devPct = n(info.developer_holding_percentage);
  const dev = info.developer_address?.toLowerCase() ?? null;
  const socials = !!(info.twitter_handle || info.telegram_handle || info.websites?.length);

  const buys = trades.filter((t) => t.kind === "buy" && t.eth > 0);
  const byWallet = new Map<string, number>();
  for (const b of buys) byWallet.set(b.from.toLowerCase(), (byWallet.get(b.from.toLowerCase()) ?? 0) + b.eth);
  const total = [...byWallet.values()].reduce((a, b) => a + b, 0);
  const biggestBuyerPct = total > 0 && buys.length >= 10 ? (Math.max(...byWallet.values()) / total) * 100 : null;
  // the same odd buy size from many different wallets: one hand split across wallets. Round sizes (0.005, 0.019 ETH:
  // two significant figures or fewer) are the presets every terminal offers, so they do not count.
  const sizes = new Map<string, Set<string>>();
  for (const b of buys) {
    const k = b.eth.toPrecision(6);
    if (Number(b.eth.toPrecision(2)) === Number(k)) continue;
    sizes.set(k, (sizes.get(k) ?? new Set()).add(b.from.toLowerCase()));
  }
  const sameSizeWallets = Math.max(0, ...[...sizes.values()].map((s) => s.size));
  const devSells = dev ? trades.filter((t) => t.kind === "sell" && t.from.toLowerCase() === dev).length : 0;

  if (info.is_honeypot === true || info.is_honeypot === "yes") blocks.push("It is flagged as a honeypot: buys go in, sells do not come out.");
  if (devPct !== null && devPct >= SHIELD.maxDevPct) blocks.push(`The creator still holds ${pct(devPct)} of the supply.`);
  if (sameSizeWallets >= SHIELD.sameSizeWallets) blocks.push(`${sameSizeWallets} different wallets bought the exact same amount: likely one buyer split across wallets.`);

  if (devSells > 0) warns.push(`The creator sold ${devSells} time${devSells > 1 ? "s" : ""} in the recent trades.`);
  if (top10Pct !== null && top10Pct >= SHIELD.warnTop10Pct) warns.push(`The top 10 holders have ${pct(top10Pct)}, curve and pool included.`);
  if (biggestBuyerPct !== null && biggestBuyerPct >= SHIELD.warnBiggestBuyerPct) warns.push(`One wallet made ${pct(biggestBuyerPct)} of the recent buying.`);
  if (byWallet.size < SHIELD.fewBuyers) warns.push(`Only ${byWallet.size} wallet${byWallet.size === 1 ? "" : "s"} bought recently.`);
  if (holders !== null && holders < SHIELD.fewHolders) warns.push(`Only ${holders} holders.`);
  if (!socials) warns.push("No X, Telegram or website listed.");

  const gt = n(info.gt_score);
  const score = blocks.length ? 0 : Math.max(0, Math.min(100, Math.round(100 - warns.length * 15 - (gt !== null && gt < 30 ? 10 : 0))));
  return { score, blocks, warns, facts: { holders, top10Pct, devPct, devSells, buyers: byWallet.size, biggestBuyerPct, sameSizeWallets, socials } };
}

const GT = "https://api.geckoterminal.com/api/v2/networks/robinhood";
const TTL_MS = 3 * 60_000;
const memo = new Map<string, { at: number; data: Promise<Shield> }>();

type RawTrade = { attributes?: { kind?: string; tx_from_address?: string; from_token_amount?: string; to_token_amount?: string; block_timestamp?: string } };
const get = <T>(url: string) =>
  fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(12_000) }).then(async (r) => {
    if (!r.ok) throw new Error(`geckoterminal ${r.status}`);
    return (await r.json()) as T;
  });

/** ShieldBot's read on a token, from GeckoTerminal; cached a few minutes per token. */
export function shield(token: string, pool: string | undefined): Promise<Shield> {
  const key = token.toLowerCase();
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  const data = Promise.all([
    get<{ data?: { attributes?: TokenInfo } }>(`${GT}/tokens/${key}/info`).then((j) => j.data?.attributes ?? {}),
    pool ? get<{ data?: RawTrade[] }>(`${GT}/pools/${pool.toLowerCase()}/trades`).then((j) => j.data ?? []).catch(() => [] as RawTrade[]) : Promise.resolve([] as RawTrade[]),
  ]).then(([info, raw]) =>
    assess(
      info,
      raw.map((t) => {
        const a = t.attributes ?? {};
        const buy = a.kind === "buy";
        return { kind: buy ? "buy" : "sell", from: a.tx_from_address ?? "", eth: Number(buy ? a.from_token_amount : a.to_token_amount) || 0, tokens: Number(buy ? a.to_token_amount : a.from_token_amount) || 0, at: Date.parse(a.block_timestamp ?? "") || 0 } as Trade;
      }),
    ),
  );
  data.catch(() => memo.delete(key));
  memo.set(key, { at: Date.now(), data });
  return data;
}

/** One line for the timeline and the model. */
export const shieldLine = (s: Shield) => (s.blocks.length ? `Blocked: ${s.blocks[0]}` : `Safety ${s.score}/100${s.warns.length ? `. ${s.warns.join(" ")}` : ", nothing flagged."}`);
