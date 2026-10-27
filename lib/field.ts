/**
 * The ASCII field: hooded bots drawn as light into a small offscreen canvas, then resampled into a grid of monospace
 * glyphs on tinted tiles. The render pipeline (light field, glyph ramp, tiles, snow) is Kurage's Ocean; the creatures
 * are ours. Channels in the light field: R = hue A, B = hue B, G = white core (the eyes). Additive.
 */
type RGB = [number, number, number];
export type Tone = { a: RGB; b: RGB; tempo: number };

export const TONES = {
  calm: { a: [92, 226, 240], b: [164, 140, 255], tempo: 1 },
  hunt: { a: [252, 140, 150], b: [164, 140, 255], tempo: 1.5 },
  win: { a: [120, 236, 170], b: [92, 226, 240], tempo: 1.2 },
} satisfies Record<string, Tone>;

const RAMP = [[".", ","], ["'", "`"], [":", "'"], [";", ":"], ["o", ";"], ["t", "o"], ["%", "t"], ["S", "%"], ["X", "S"], ["8", "X"], ["@", "8"], ["#", "@"]];
const SNOW = [".", ".", ".", "-", "-", "'", ",", "·"];
const ACCENTS = ["#f9a8d4", "#fcd34d", "#86efac", "#c4b5fd"];
const SS = 2; // offscreen samples per cell, per axis
const SLOTS: Array<[number, number, number]> = [[0.16, 0.36, 0.82], [0.84, 0.26, 1], [0.36, 0.92, 0.9], [0.7, 0.74, 0.6], [0.06, 0.96, 0.64]];
const HUES = [0.12, 0.9, 0.3, 0.78, 0.55];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
function hash(x: number, y: number, t: number) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(t, 1103515245);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const col = (m: number, k: number, w: number) => `rgb(${Math.min(255, (1 - m) * k * 255) | 0},${Math.min(255, w * 255) | 0},${Math.min(255, m * k * 255) | 0})`;

type Bot = { x: number; y: number; z: number; R: number; vx: number; vy: number; tilt: number; bob: number; mix: number; wander: number; look: number; blinkAt: number };

export function createField(host: HTMLElement, canvas: HTMLCanvasElement, font: string) {
  const ctx = canvas.getContext("2d")!;
  const off = document.createElement("canvas");
  const octx = off.getContext("2d", { willReadFrequently: true })!;

  let W = 0, H = 0, dpr = 1, cw = 10, ch = 15, cols = 0, rows = 0, ow = 0, oh = 0, fs = 11;
  let bots: Bot[] = [];
  let snow: Array<{ x: number; y: number; vy: number; vx: number; seed: number; g: string; run: number; style: string }> = [];
  let time = 0, last = 0, acc = 0, raf = 0;
  let playing = true, visible = !document.hidden;
  let gain = 1, typingUntil = 0, boostUntil = 0;
  let tone: Tone = TONES.calm;
  const pointer = { x: -1e5, y: -1e5 };
  const target = { x: 0, y: 0 };
  const styles = new Map<number, { tile: string; glyph: string }>();

  const baseRadius = () => clamp(Math.min(W, H * 1.25) * 0.07, 42, 92);
  const desiredCount = () => (W < 600 ? 3 : W < 1100 ? 4 : 5);
  const makeBot = (x: number, y: number, z: number, mix: number): Bot => ({
    x, y, z, R: baseRadius() * (0.62 + 0.55 * z) * (0.88 + Math.random() * 0.24), vx: 0, vy: 0, tilt: 0,
    bob: Math.random() * 6.28, mix, wander: Math.random() * 100, look: 0, blinkAt: 1 + Math.random() * 4,
  });

  function seed() {
    bots = Array.from({ length: desiredCount() }, (_, i) => makeBot(SLOTS[i]![0] * W, SLOTS[i]![1] * H, SLOTS[i]![2], HUES[i]!)).sort((a, b) => a.z - b.z);
    snow = Array.from({ length: Math.round((cols * rows) / 80) }, () => ({
      x: Math.random() * W, y: Math.random() * H, vy: 3 + Math.random() * 8, vx: (Math.random() - 0.5) * 3, seed: Math.random() * 6.28,
      g: SNOW[(Math.random() * SNOW.length) | 0]!, run: Math.random() < 0.16 ? 2 + ((Math.random() * 3) | 0) : 1,
      style: `rgba(150,172,205,${(0.14 + Math.random() * 0.3).toFixed(3)})`,
    }));
  }

  function step(dt: number) {
    time += dt;
    const typing = time < typingUntil;
    const gTarget = (typing ? 1.1 : 1) * (time < boostUntil ? 1.3 : 1);
    gain += (gTarget - gain) * Math.min(1, dt * 2.4);
    const tempo = tone.tempo * (typing ? 1.25 : 1);
    for (const b of bots) {
      b.bob += dt * 1.1 * tempo;
      // a slow rise with a sway, like something floating up through water
      b.vy += (-6 * (0.5 + b.z) * tempo - b.vy) * Math.min(1, dt * 0.8);
      b.vx += Math.sin(time * 0.09 + b.wander) * 2 * dt;
      const pdx = b.x - pointer.x, pdy = b.y - pointer.y, pd = Math.hypot(pdx, pdy) || 1;
      if (pd < b.R * 2.4) {
        const push = (1 - pd / (b.R * 2.4)) * 48 * dt;
        b.vx += (pdx / pd) * push;
        b.vy += (pdy / pd) * push;
      }
      b.vx *= Math.exp(-dt * 0.9);
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      const wantTilt = typing ? clamp((target.x - b.x) / W, -0.35, 0.35) : Math.sin(time * 0.13 + b.wander) * 0.18;
      b.tilt += (wantTilt - b.tilt) * Math.min(1, dt * 0.8);
      const wantLook = typing ? clamp((target.x - b.x) / (b.R * 6), -1, 1) : Math.sin(time * 0.31 + b.wander) * 0.7;
      b.look += (wantLook - b.look) * Math.min(1, dt * 3);
      if (time > b.blinkAt + 0.16) b.blinkAt = time + 2.5 + Math.random() * 4;
      if (b.y < -b.R * 2.5) Object.assign(b, makeBot(W * (0.08 + Math.random() * 0.84), H + b.R * 1.6, b.z, Math.random()));
      else if (b.x < -b.R * 2) b.x += W + b.R * 4;
      else if (b.x > W + b.R * 2) b.x -= W + b.R * 4;
    }
    for (const s of snow) {
      s.y += s.vy * dt;
      s.x += (s.vx + Math.sin(time * 0.3 + s.seed) * 2) * dt;
      if (s.y > H + ch) { s.y = -ch; s.x = Math.random() * W; }
      if (s.x < -cw * 8) s.x += W + cw * 8; else if (s.x > W + cw) s.x -= W + cw * 8;
    }
  }

  /** The hood outline: a rounded dome whose peak flops to one side, open at the bottom into the shoulders. */
  function hoodPath(R: number) {
    octx.beginPath();
    octx.moveTo(-R * 1.05, R * 0.95);
    octx.bezierCurveTo(-R * 1.15, R * 0.2, -R * 1.05, -R * 0.75, -R * 0.45, -R * 1.05);
    octx.bezierCurveTo(-R * 0.35, -R * 1.55, -R * 0.1, -R * 1.62, R * 0.05, -R * 1.2);
    octx.bezierCurveTo(R * 0.8, -R * 1.05, R * 1.12, -R * 0.4, R * 1.05, R * 0.95);
    octx.quadraticCurveTo(0, R * 1.15, -R * 1.05, R * 0.95);
    octx.closePath();
  }

  function drawField() {
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.globalCompositeOperation = "source-over";
    octx.fillStyle = "#000";
    octx.fillRect(0, 0, ow, oh);
    octx.setTransform(SS / cw, 0, 0, SS / ch, 0, 0);
    octx.globalCompositeOperation = "lighter";
    const boost = time < boostUntil ? (boostUntil - time) / 1.8 : 0;
    for (const b of bots) {
      const k = gain * (0.54 + 0.56 * b.z) * (1 + boost * 0.6);
      const m = b.mix, R = b.R;
      octx.save();
      octx.translate(b.x, b.y + Math.sin(b.bob) * R * 0.06);
      octx.rotate(b.tilt);
      hoodPath(R);
      const g = octx.createRadialGradient(0, -R * 0.2, R * 0.2, 0, -R * 0.1, R * 1.4);
      g.addColorStop(0, col(m, k * 0.5, 0.05 * k));
      g.addColorStop(1, col(m, k * 0.72, 0.08 * k));
      octx.fillStyle = g;
      octx.fill();
      octx.lineWidth = Math.max(5, R * 0.09);
      octx.strokeStyle = col(m, k * 0.55, 0.2 * k);
      octx.stroke();
      // the face opening: drawn dark over the hood ("lighter" cannot subtract, so this pass replaces)
      octx.globalCompositeOperation = "source-over";
      octx.beginPath();
      octx.ellipse(b.look * R * 0.08, -R * 0.02, R * 0.68, R * 0.56, 0, 0, Math.PI * 2);
      octx.fillStyle = col(m, k * 0.06, 0);
      octx.fill();
      octx.globalCompositeOperation = "lighter";
      // eyes: the white core, so the glyph grid inverts them into bright tiles
      const blink = time > b.blinkAt && time < b.blinkAt + 0.16 ? 0.15 : 1;
      octx.fillStyle = col(m, k * 0.95, 1.1 * k);
      for (const side of [-1, 1]) {
        octx.beginPath();
        octx.ellipse(side * R * 0.26 + b.look * R * 0.16, -R * 0.06, R * 0.12, R * 0.21 * blink, 0, 0, Math.PI * 2);
        octx.fill();
      }
      octx.restore();
    }
  }

  function style(tb: number, lv: number, wb: number) {
    const key = (tb * 12 + lv) * 3 + wb;
    let s = styles.get(key);
    if (s) return s;
    const t = tb / 5, L = (lv + 0.5) / 12, w = [0, 0.3, 0.62][wb]!;
    const base = [0, 1, 2].map((i) => lerp(tone.a[i]!, tone.b[i]!, t));
    const hot = lv >= 10 && wb > 0;
    const tile = base.map((v) => lerp(v * 0.58, 236, hot ? 0.5 + w * 0.3 : 0) | 0);
    const glyph = hot ? [6, 10, 16] : base.map((v) => lerp(v, 246, clamp(0.12 + L * 0.5 + w * 0.34, 0, 0.94)) | 0);
    s = {
      tile: `rgba(${tile.join(",")},${(hot ? 0.9 : 0.1 + L * 0.5).toFixed(3)})`,
      glyph: hot ? `rgb(${glyph.join(",")})` : `rgba(${glyph.join(",")},${(0.4 + L * 0.6).toFixed(3)})`,
    };
    styles.set(key, s);
    return s;
  }

  function render() {
    if (!W) return;
    drawField();
    const d = octx.getImageData(0, 0, ow, oh).data;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.font = `500 ${fs}px ${font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const ty = ch / 2 + 0.5, tx = cw / 2;
    for (const s of snow) {
      const cx = Math.floor(s.x / cw), cy = Math.floor(s.y / ch);
      ctx.fillStyle = s.style;
      for (let r = 0; r < s.run; r++) ctx.fillText(s.run > 1 ? "-" : s.g, (cx + r * 2) * cw + tx, cy * ch + ty);
    }
    const row = ow * 4;
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const i = (cy * SS * ow + cx * SS) * 4;
        const a = (d[i]! + d[i + 4]! + d[i + row]! + d[i + row + 4]!) / 1020;
        const w = (d[i + 1]! + d[i + 5]! + d[i + row + 1]! + d[i + row + 5]!) / 1020;
        const b = (d[i + 2]! + d[i + 6]! + d[i + row + 2]! + d[i + row + 6]!) / 1020;
        const L = Math.min(1, a + b + w * 0.55);
        if (L < 0.055) continue;
        const lv = Math.min(11, (L * 12) | 0);
        const st = style(Math.round((b / (a + b + 1e-4)) * 5), lv, w < 0.12 ? 0 : w < 0.32 ? 1 : 2);
        const x = cx * cw, y = cy * ch;
        if (lv >= 1) { ctx.fillStyle = st.tile; ctx.fillRect(x + 1, y + 1, cw - 2, ch - 2); }
        const h = hash(cx, cy, Math.floor(time * 1.4 + ((cx * 7 + cy * 13) & 15) / 16));
        ctx.fillStyle = lv >= 4 && lv < 10 && h > 0.986 ? ACCENTS[((h * 1e4) | 0) & 3]! : st.glyph;
        ctx.fillText(RAMP[lv]![h < 0.55 ? 0 : 1]!, x + tx, y + ty);
      }
    }
  }

  function loop(now: number) {
    raf = requestAnimationFrame(loop);
    if (!last) { last = now; return; }
    acc += Math.min((now - last) / 1000, 0.1);
    last = now;
    if (acc < 1 / 30) return;
    const n = Math.max(1, Math.min(6, Math.round(acc * 60)));
    for (let i = 0; i < n; i++) step(acc / n);
    acc = 0;
    render();
  }
  function sync() {
    const should = playing && visible && W > 0;
    if (should && !raf) { last = 0; raf = requestAnimationFrame(loop); }
    else if (!should && raf) { cancelAnimationFrame(raf); raf = 0; }
  }

  function resize() {
    const r = host.getBoundingClientRect();
    const nW = Math.max(1, Math.round(r.width)), nH = Math.max(1, Math.round(r.height));
    if (nW === W && nH === H) return;
    const first = !W;
    W = nW; H = nH;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cw = W < 600 ? 8 : W < 1100 ? 9 : 10;
    ch = Math.round(cw * 1.5);
    fs = Math.round(ch * 0.74);
    cols = Math.ceil(W / cw); rows = Math.ceil(H / ch);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ow = cols * SS; oh = rows * SS;
    off.width = ow; off.height = oh;
    host.style.setProperty("--cw", `${cw}px`);
    host.style.setProperty("--ch", `${ch}px`);
    if (first) {
      seed();
      for (let i = 0; i < 120; i++) step(1 / 60);
    } else {
      seed();
    }
    render();
    sync();
  }

  const onVisibility = () => { visible = !document.hidden; sync(); };
  document.addEventListener("visibilitychange", onVisibility);

  return {
    resize,
    redraw() { styles.clear(); render(); },
    setTarget(x: number, y: number) { target.x = x; target.y = y; },
    setPointer(x: number, y: number) { pointer.x = x; pointer.y = y; },
    setPlaying(v: boolean) { playing = v; sync(); if (!v) render(); },
    setTone(t: Tone) { tone = t; styles.clear(); },
    typing() { typingUntil = time + 1.8; },
    pulse() { boostUntil = time + 1.8; },
    destroy() { cancelAnimationFrame(raf); raf = 0; document.removeEventListener("visibilitychange", onVisibility); },
  };
}

export type Field = ReturnType<typeof createField>;
