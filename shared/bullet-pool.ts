import { entityId } from './simulation.js';
import type { Bullet } from './simulation.js';
/** Pool owns bullets until collision, expiry, or world reset. */
export class BulletPool {
  private readonly free: Bullet[];
  private readonly active = new Set<Bullet>();
  constructor(capacity = 256) {
    this.free = Array.from({length:capacity},()=>({kind:'bullet' as const,id:entityId(0),owner:entityId(0),x:0,y:0,vx:0,vy:0,life:0}));
  }
  acquire(properties: Bullet): Bullet {
    const bullet = this.free.pop() ?? {kind:'bullet',id:entityId(0),owner:entityId(0),x:0,y:0,vx:0,vy:0,life:0};
    Object.assign(bullet,properties);
    this.active.add(bullet);
    return bullet;
  }
  release(bullet: Bullet): void {
    if (!this.active.delete(bullet)) return;
    bullet.life=0;
    this.free.push(bullet);
  }
  activeCount(): number {return this.active.size;}
}
