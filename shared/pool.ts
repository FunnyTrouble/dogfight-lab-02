/** Reusable fixed-size particle records, preallocated to avoid per-spawn new objects. */
export interface Particle { x: number; y: number; vx: number; vy: number; ttl: number; active: boolean }
export class ParticlePool {
  readonly items: Particle[];
  constructor(capacity = 256) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error('Invalid capacity');
    this.items = Array.from({ length: capacity }, () => ({ x: 0, y: 0, vx: 0, vy: 0, ttl: 0, active: false }));
  }
  spawn(x: number, y: number, vx: number, vy: number, ttl: number): Particle | null {
    for (const particle of this.items) if (!particle.active) {
      particle.x = x; particle.y = y; particle.vx = vx; particle.vy = vy; particle.ttl = ttl; particle.active = true;
      return particle;
    }
    return null;
  }
  update(dt: number): void {
    for (const p of this.items) if (p.active) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.ttl -= dt;
      if (p.ttl <= 0) p.active = false;
    }
  }
  activeCount(): number { let n = 0; for (const p of this.items) if (p.active) n++; return n; }
}
