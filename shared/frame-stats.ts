/** Bounded samples: the render loop never grows an unbounded array. */
export class FrameStats {
  private readonly samples: Float64Array;
  private cursor = 0;
  private count = 0;
  constructor(size = 1800) { if (!Number.isInteger(size) || size < 1) throw new Error('Invalid sample size'); this.samples = new Float64Array(size); }
  add(milliseconds: number): void {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) return;
    this.samples[this.cursor] = milliseconds;
    this.cursor = (this.cursor + 1) % this.samples.length;
    this.count = Math.min(this.samples.length, this.count + 1);
  }
  summary(): { count: number; p50: number; p95: number; p99: number; max: number } {
    if (!this.count) return { count: 0, p50: 0, p95: 0, p99: 0, max: 0 };
    const sorted = Array.from(this.samples.subarray(0, this.count)).sort((a,b) => a-b);
    const at = (p: number) => sorted[Math.ceil(p * this.count)-1] ?? 0;
    return { count: this.count, p50: at(.5), p95: at(.95), p99: at(.99), max: sorted[this.count - 1] ?? 0 };
  }
}
