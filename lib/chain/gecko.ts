/** Shared per-runtime request budget. Failed reads never become successful safety reads. */
export class GeckoClient {
  private cache = new Map<string, { until: number; data: Promise<unknown>; good?: unknown; goodAt?: number }>();
  private pausedUntil = 0;
  private nextSlot = 0;

  constructor(private request: typeof fetch = (input, init) => fetch(input, init), private now = Date.now, private wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))) {}

  get<T>(url: string, ttl = 60_000, maxAge = 10 * 60_000): Promise<T> {
    const hit = this.cache.get(url);
    if (hit && this.now() < hit.until && (hit.until === Infinity || hit.goodAt === undefined || this.now() - hit.goodAt < maxAge)) return hit.data as Promise<T>;
    const data = this.load<T>(url).then((json) => {
      this.cache.set(url, { until: this.now() + ttl, data: Promise.resolve(json), good: json, goodAt: this.now() });
      return json;
    }).catch((error) => {
      // Keep errors briefly too: several agents must not repeat a refused request.
      const until = Math.max(this.now() + 15_000, this.pausedUntil);
      if (hit?.good !== undefined && this.now() - (hit.goodAt ?? 0) < maxAge) {
        this.cache.set(url, { ...hit, until: Math.min(until, (hit.goodAt ?? 0) + maxAge), data: Promise.resolve(hit.good) });
        return hit.good as T;
      }
      this.cache.set(url, { until, data });
      throw error;
    });
    this.cache.set(url, { ...hit, until: Infinity, data });
    while (this.cache.size > 500) this.cache.delete(this.cache.keys().next().value!);
    return data;
  }

  private async load<T>(url: string): Promise<T> {
    if (this.now() < this.pausedUntil) throw new Error("geckoterminal 429: cooling down");
    // Reserve starts, rather than firing every agent's requests together (free tier: ~30/min).
    const slot = Math.max(this.now(), this.nextSlot);
    this.nextSlot = slot + 2_100;
    if (slot > this.now()) await this.wait(slot - this.now());
    if (this.now() < this.pausedUntil) throw new Error("geckoterminal 429: cooling down");
    const response = await this.request(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
    if (response.status === 429) {
      const retry = response.headers.get("retry-after");
      const seconds = retry === null ? NaN : Number(retry);
      const delay = Number.isFinite(seconds) ? seconds * 1000 : retry ? Date.parse(retry) - this.now() : 60_000;
      this.pausedUntil = this.now() + Math.max(60_000, Number.isFinite(delay) ? delay : 60_000);
    }
    if (!response.ok) throw new Error(`geckoterminal ${response.status}`);
    return response.json() as Promise<T>;
  }
}
