import { Entity } from "./entity.js";

export function createHomingBehavior({ turnRate = 2.2, speed = 260 } = {}) {
  return {
    update(entity, dt, world) {
      const target = [...world.ofKind("asteroid")]
        .filter((item) => !item.dead)
        .sort(
          (a, b) =>
            a.position.sub(entity.position).length() -
            b.position.sub(entity.position).length(),
        )[0];
      if (!target) return;
      const desired = target.position.sub(entity.position).normalize();
      const current =
        entity.velocity.length() > 0 ? entity.velocity.normalize() : desired;
      const blend = Math.min(1, turnRate * dt);
      const direction = current
        .scale(1 - blend)
        .add(desired.scale(blend))
        .normalize();
      entity.velocity = direction.scale(speed);
    },
  };
}

export class Bullet extends Entity {
  constructor(position, velocity, { homing = false } = {}) {
    super({ position, velocity, radius: 4, kind: "bullet" });
    this.ttl = 1.8;
    this.damage = 1;
    this.owner = null;
    this.behavior = homing ? createHomingBehavior() : null;
  }

  update(dt, world) {
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
    if (this.behavior) this.behavior.update(this, dt, world);
    super.update(dt, world);
  }
}
