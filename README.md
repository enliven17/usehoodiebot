# HOODIEBOT

Live: https://hoodiebot.vercel.app (Vercel `cankats-projects/hoodiebot`, Convex `hoodiebot`: dev `amiable-basilisk-273`, prod `quiet-setter-314`)

Your private trading team on Robinhood Chain. You talk to HOODIEBOT; it hands the work to ResearchBot, SniperBot,
TraderBot and LaunchBot, and they trade Pons tokens from a wallet that belongs to your team alone.

- **Site**: landing, litepaper, terms, privacy (`app/`)
- **App** (`/app`): ConnectKit sign-in, chat, approvals, the team wallet with P&L, the decisions timeline, positions, strategies
- **Brand**: `brand/` (logo, X profile and banner, posts, kit sheets) and `public/og/` (link previews)

## Stack

| Layer | What |
|---|---|
| Web | Next.js 16 on Vercel, plain CSS on Kurage tokens (`app/globals.css`) |
| Data | Convex (`convex/`), called only from the Next server with `HOODIEBOT_SECRET` |
| Brain | Token Harbor (free DeepSeek V4.1 Flash, DeepSeek V4 Flash, MiMo), then OpenRouter, Groq and Gemini, keys rotating (`lib/server/llm.ts`, `brain.ts`, `tools.ts`) |
| Wallet connect | Family's ConnectKit + wagmi, Kurage theme (`components/app/Wallets.tsx`); `.npmrc` has legacy-peer-deps for its React 18 peer range |
| Wallets | Privy server wallets under a deny-by-default policy (`lib/chain/policy.ts`) |
| Chain | Robinhood Chain 4663, Pons V2 curves and Uniswap v4 (`lib/chain/`) |
| Market | GeckoTerminal (`lib/chain/market.ts`) |
| Character | `@bible-strong/avatar-react` with `lib/avatar/hoodiebot.avatar.json` |
| Schedule | Convex cron, every minute, calls `/api/cron/tick` (`convex/crons.ts`) |

## Run it

```bash
npm install
cp .env.example .env.local      # fill it in, see below
npx convex dev                  # first run: creates the deployment, writes NEXT_PUBLIC_CONVEX_URL, regenerates convex/_generated
npx convex env set HOODIEBOT_SECRET <same as .env.local>
npm run dev
```

Checks: `npm run typecheck`, `npm test`, `npx convex dev --once` (deploys and typechecks the Convex functions),
`npm run e2e -- <url> [--strategy]` (signs in with a throwaway key, creates an empty team wallet, chats; with
`--strategy` also waits for the minute tick to match a token and checks the approval is refused for lack of ETH).

## Environment

| Name | Where | What |
|---|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | Vercel | Convex deployment URL |
| `HOODIEBOT_SECRET` | Vercel + Convex | 32+ characters; every Convex function checks it |
| `SESSION_SECRET` | Vercel | 32+ characters; signs the session cookie |
| `CRON_SECRET` | Vercel + Convex | authorizes `/api/cron/tick` |
| `SITE_URL` | Convex | e.g. `https://usehoodiebot.com`, where the cron sends the tick |
| `TOKENHARBOR_API_KEYS`, `OPENROUTER_API_KEYS`, `GROQ_API_KEYS`, `GEMINI_API_KEYS` | Vercel | the brain, tried in that order (Token Harbor's free DeepSeek first); comma-separated keys rotate, `*_MODELS` override the model order |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Vercel | Reown project; its domain allowlist must include the site |
| `PRIVY_APP_ID`, `PRIVY_APP_SECRET` | Vercel | Privy app |
| `PRIVY_AUTHORIZATION_KEY` | Vercel | `wallet-auth:…` P-256 key; owns every wallet and policy, required in production |
| `ROBINHOOD_RPC` | Vercel | a provider endpoint; the public RPC is rate limited |
| `NEXT_PUBLIC_HOODIE_CA` | Vercel | optional; shows the $HOODIE contract on the landing page |

## Deploy

1. `npx convex deploy` (production deployment), then set `HOODIEBOT_SECRET`, `CRON_SECRET`, `SITE_URL` on it.
2. Import the repo in Vercel, set the Vercel variables above, deploy.
3. Open `/app`, sign in, send a little ETH on Robinhood Chain to the team wallet, and keep strategies on
   "Ask before each trade" until you trust them.

## Credits

The chart reads (`lib/ta.ts`), the strategy backtest (`lib/server/backtest.ts`), the trade journal (`lib/journal.ts`) and
the team memory follow ideas from [Vibe-Trading](https://github.com/HKUDS/Vibe-Trading) (MIT), rebuilt in TypeScript
for Pons candles; none of its code runs here.

## How money moves

- Chat never trades: `propose_trade` creates an approval; only the owner's Approve executes it.
- Strategies in "ask" mode do the same; in "auto" mode the tick trades within the strategy's size, slippage and
  max-open limits.
- One transaction at a time per wallet (a lease in Convex), so nonces never collide.
- The wallet policy only signs Pons curve trades paying the wallet itself, Uniswap v4 router and Permit2 calls,
  token approvals, and ETH sent to the owner. Withdrawals go to the owner only.
- Fills are booked from receipts. A 0.0003 ETH gas reserve stays in the wallet.
