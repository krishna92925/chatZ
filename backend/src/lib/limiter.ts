/** Small in-memory sliding-window limiter, keyed by anything (user id, email, socket id...). */
export class KeyedLimiter {
  private hits = new Map<string, number[]>();
  private timer: NodeJS.Timeout;

  constructor(private windowMs: number, private max: number) {
    this.timer = setInterval(() => this.sweep(), Math.max(windowMs, 30_000));
    this.timer.unref();
  }

  /** returns true when the call is allowed */
  take(key: string, now = Date.now()): boolean {
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (list.length >= this.max) {
      this.hits.set(key, list);
      return false;
    }
    list.push(now);
    this.hits.set(key, list);
    return true;
  }

  private sweep() {
    const now = Date.now();
    for (const [k, v] of this.hits) {
      const kept = v.filter((t) => now - t < this.windowMs);
      if (kept.length) this.hits.set(k, kept);
      else this.hits.delete(k);
    }
  }

  stop() {
    clearInterval(this.timer);
  }
}
