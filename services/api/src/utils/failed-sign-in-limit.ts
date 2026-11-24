/**
 * Failed-only sign-in limiter.
 *
 * Rules:
 *  - Only FAILED sign-ins consume the allowance (max per window, default 5 / 15 min).
 *  - Successful sign-ins never change the stored counter or its timestamp.
 *  - Once `max` failures exist inside the window, every sign-in attempt is refused
 *    (a correct password too) until `window` has passed since the LAST failure.
 *  - Requests in flight are counted as potential failures (reservations), so a burst of
 *    concurrent bad passwords cannot pass the check together. A reservation is released
 *    when its request finishes, whether it failed (then a failure is recorded) or not.
 *
 * The store is injected so the same logic runs on the RateLimit table in production
 * and on an in-memory map in tests.
 */
export interface FailureStore {
  get(key: string): Promise<{ count: number; lastFailure: number } | null>;
  /** Atomically add one failure. Resets to 1 when the old window already ended. */
  recordFailure(key: string, now: number, windowMs: number): Promise<void>;
}

export class FailedSignInLimiter {
  private inFlight = new Map<string, number>();
  /** Failures whose store write failed. They keep counting against the key until a later write succeeds. */
  private unrecorded = new Map<string, number>();

  constructor(
    private store: FailureStore,
    private max = 5,
    private windowMs = 15 * 60 * 1000,
    private clock: () => number = Date.now,
  ) {}

  /** Returns a release function when allowed, or the seconds to wait when refused. */
  async begin(key: string): Promise<{ ok: true; finish: (failed: boolean) => Promise<void> } | { ok: false; retryAfterSeconds: number }> {
    await this.flushUnrecorded(key);
    const now = this.clock();
    const rec = await this.store.get(key);
    const failures = rec && now - rec.lastFailure <= this.windowMs ? rec.count : 0;
    const pending = (this.inFlight.get(key) ?? 0) + (this.unrecorded.get(key) ?? 0);
    if (failures + pending >= this.max) {
      const base = rec ? rec.lastFailure : now;
      const retry = failures >= this.max ? Math.max(1, Math.ceil((base + this.windowMs - now) / 1000)) : 1;
      return { ok: false, retryAfterSeconds: retry };
    }
    this.inFlight.set(key, (this.inFlight.get(key) ?? 0) + 1);
    let done = false;
    return {
      ok: true,
      finish: async (failed: boolean) => {
        if (done) return;
        done = true;
        try {
          if (failed) {
            try {
              await this.store.recordFailure(key, this.clock(), this.windowMs);
            } catch (error) {
              this.unrecorded.set(key, (this.unrecorded.get(key) ?? 0) + 1);
              throw error;
            }
          }
        } finally {
          const n = (this.inFlight.get(key) ?? 1) - 1;
          if (n <= 0) this.inFlight.delete(key); else this.inFlight.set(key, n);
        }
      },
    };
  }

  /** Retry failures that could not be saved earlier. If the store is still down this throws, so begin() fails closed. */
  private async flushUnrecorded(key: string): Promise<void> {
    let n = this.unrecorded.get(key) ?? 0;
    while (n > 0) {
      await this.store.recordFailure(key, this.clock(), this.windowMs);
      n -= 1;
      if (n > 0) this.unrecorded.set(key, n); else this.unrecorded.delete(key);
    }
  }
}
