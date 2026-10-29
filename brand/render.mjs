// Renders every brand image from its source page (app/kit/[name], dev only) at its exact size.
// Run with the dev server up: npm run dev, then node brand/render.mjs [name...]  (needs Playwright: npx playwright install chromium)
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const SITE = process.env.KIT_URL ?? "http://localhost:3000";
const ALL = {
  "x-profile": [800, 800, "x-profile.png"],
  "x-banner": [1500, 500, "x-banner.png"],
  "mark-tile": [1024, 1024, "logo/hoodiebot-tile.png"],
  og: [1200, 630, "../public/og/home.png"],
  "og-litepaper": [1200, 630, "../public/og/litepaper.png"],
  "og-app": [1200, 630, "../public/og/app.png"],
  "post-intro": [1600, 900, "posts/intro.png"],
  "post-wallet": [1600, 900, "posts/wallet.png"],
  "post-what": [1600, 900, "posts/what.png"],
  "kit-logo": [1600, 900, "kit/logo.png"],
  "kit-colour": [1600, 900, "kit/colour.png"],
  "kit-type": [1600, 900, "kit/type.png"],
};

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(ALL);
const browser = await chromium.launch();
for (const name of names) {
  const [w, h, out] = ALL[name];
  const scale = name === "x-banner" ? 2 : 1;
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
  await page.goto(`${SITE}/kit/${name}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.waitForTimeout(2600); // let the field drift and the avatars settle
  const path = new URL(out, import.meta.url);
  await mkdir(new URL(".", path), { recursive: true });
  await page.locator(`[data-kit="${name}"]`).screenshot({ path: path.pathname.replace(/^\/([A-Z]:)/, "$1") });
  await page.close();
  console.log(`${name} -> ${out}`);
}
await browser.close();
