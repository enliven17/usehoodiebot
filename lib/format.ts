const SUB = "₀₁₂₃₄₅₆₇₈₉";

/** A memecoin price in ETH: 0.0₈1643 for tiny ones (the subscript counts the zeros after the point). */
export function price(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1) return n.toFixed(4);
  if (n >= 1e-4) return n.toPrecision(4);
  const zeros = Math.floor(-Math.log10(n));
  const digits = Math.round(n * 10 ** (zeros + 4)).toString().replace(/0+$/, "") || "1";
  return `0.0${String(zeros).split("").map((d) => SUB[+d]).join("")}${digits}`;
}

/** $12.3k, $1.4M. */
export const usd = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(n) ? "–" : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}k` : `$${n.toFixed(0)}`;

/** now, 5m, 3h, 2d. */
export function ago(at: number) {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  return s < 60 ? "now" : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86_400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86_400)}d`;
}
