/** Pure token bucket, supplied monotonic time makes it testable. */
export class TokenBucket {
  private tokens: number;
  private last: number;
  constructor(readonly rate: number, readonly capacity: number, now = 0) {
    if (!(rate > 0 && capacity > 0)) throw new Error('Invalid rate');
    this.tokens = capacity; this.last = now;
  }
  take(now: number, count = 1): boolean {
    if (!Number.isFinite(now) || !Number.isFinite(count) || count <= 0 || now < this.last) return false;
    this.tokens = Math.min(this.capacity, this.tokens + (now - this.last) * this.rate / 1000);
    this.last = now;
    if (this.tokens + 1e-12 < count) return false;
    this.tokens -= count; return true;
  }
  available(): number { return this.tokens; }
}
