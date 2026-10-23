export interface RateLimitHit {
  count: number;
  resetAt: number;
}

/**
 * Storage behind the rate limiters. The default in-memory implementation is
 * per-process; to share limits across several instances, provide an
 * implementation backed by Redis (INCR + PEXPIRE) and assign it to
 * `rateLimitStore` at bootstrap.
 */
export interface RateLimitStore {
  hit(key: string, windowMs: number, now?: number): RateLimitHit;
}

export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, RateLimitHit>();

  hit(key: string, windowMs: number, now = Date.now()): RateLimitHit {
    let bucket = this.buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      this.buckets.set(key, bucket);
    }
    bucket.count += 1;

    if (this.buckets.size > 10_000) {
      for (const [k, b] of this.buckets) {
        if (now >= b.resetAt) this.buckets.delete(k);
      }
    }

    return bucket;
  }
}

/** Process-wide store shared by every limiter. */
export let rateLimitStore: RateLimitStore = new InMemoryRateLimitStore();

export function setRateLimitStore(store: RateLimitStore): void {
  rateLimitStore = store;
}
