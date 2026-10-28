// Records the launch film from the dev server's /promo page to brand/video/hoodie-launch.mp4: 1920×1080, 30 fps, H.264.
// Real time, through Chrome's screencast: every painted frame arrives as a high-quality JPEG with its timestamp, and
// ffmpeg lays them on an even 30 fps timeline. (Playwright's own video is low bitrate; a faked clock stalls Motion's
// exit animations.) npm run dev, then: node brand/promo.mjs [baseUrl]   (needs ffmpeg on PATH)
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:3011";
const out = join(import.meta.dirname, "video", "hoodie-launch.mp4");
const dir = mkdtempSync(join(tmpdir(), "promo-"));
mkdirSync(join(import.meta.dirname, "video"), { recursive: true });

const browser = await chromium.launch({ headless: false, args: ["--force-device-scale-factor=1", "--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--window-size=1920,1180"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(`${base}/promo`, { waitUntil: "networkidle", timeout: 120_000 });
await page.addStyleTag({ content: "nextjs-portal { display: none !important }" });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(1500);

const cdp = await page.context().newCDPSession(page);
const frames = [];
cdp.on("Page.screencastFrame", async (f) => {
  const file = join(dir, `f${String(frames.length).padStart(5, "0")}.jpg`);
  writeFileSync(file, Buffer.from(f.data, "base64"));
  frames.push({ file, t: f.metadata.timestamp });
  await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 95, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
await page.waitForTimeout(300);
await page.evaluate(() => window.promoStart());
await page.waitForFunction(() => window.promoDone === true, null, { timeout: 90_000, polling: 100 });
await page.waitForTimeout(1500);
await cdp.send("Page.stopScreencast");
await browser.close();

// each frame shown until the next one arrived; the first from the moment the film started
const list = frames.map((f, i) => `file '${f.file.replaceAll("\\", "/")}'\nduration ${Math.max(0.001, (frames[i + 1]?.t ?? f.t + 0.5) - f.t).toFixed(4)}`).join("\n");
writeFileSync(join(dir, "list.txt"), `${list}\nfile '${frames.at(-1).file.replaceAll("\\", "/")}'\n`);
execFileSync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", join(dir, "list.txt"), "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-movflags", "+faststart", out], { stdio: "inherit" });
const span = frames.at(-1).t - frames[0].t;
console.log(`wrote ${out}: ${frames.length} frames over ${span.toFixed(1)} s (${(frames.length / span).toFixed(1)} fps captured)`);
rmSync(dir, { recursive: true, force: true });
