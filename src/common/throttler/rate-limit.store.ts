export interface RateLimitHit {
  count: number;
  resetAt: number;
}

/** Injection token for the store used by every rate limiter. */
export const RATE_LIMIT_STORE = Symbol('RATE_LIMIT_STORE');

/**
 * Storage behind the rate limiters. `hit` is asynchronous so that a network
 * backed implementation can be used without touching the guards.
 *
 * The default in-memory implementation is per-process. To share limits across
 * several app instances, implement this interface on top of Redis (a Lua
 * script doing INCR + PEXPIRE atomically, returning the count and the key's
 * PTTL) and bind it to RATE_LIMIT_STORE in RateLimitModule.
 */
export interface RateLimitStore {
  hit(key: string, windowMs: number, now?: number): Promise<RateLimitHit>;
}

const SWEEP_THRESHOLD = 10_000;
const SWEEP_MIN_INTERVAL_MS = 10_000;

export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, RateLimitHit>();
  private lastSweep = 0;

  hit(key: string, windowMs: number, now = Date.now()): Promise<RateLimitHit> {
    let bucket = this.buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      this.buckets.set(key, bucket);
    }
    bucket.count += 1;
    this.sweep(now);
    return Promise.resolve({ ...bucket });
  }

  /**
   * Drop expired buckets. Rate-limited itself: scanning the whole map on every
   * hit would let many distinct clients turn the limiter into a CPU cost.
   */
  private sweep(now: number): void {
    if (
      this.buckets.size <= SWEEP_THRESHOLD ||
      now - this.lastSweep < SWEEP_MIN_INTERVAL_MS
    ) {
      return;
    }
    this.lastSweep = now;
    for (const [k, b] of this.buckets) {
      if (now >= b.resetAt) this.buckets.delete(k);
    }
  }
}
