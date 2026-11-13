import { Entity } from "./entity.js";
import { Vector2 } from "./vector2.js";

export class Explosion extends Entity {
  constructor(position, count = 12) {
    super({
      position: new Vector2(position.x, position.y),
      radius: 0,
      kind: "explosion",
    });
    this.ttl = 0.45;
    this.particles = Array.from({ length: count }, () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 35 + Math.random() * 150;
      return {
        position: new Vector2(),
        velocity: Vector2.fromAngle(angle).scale(speed),
        size: 1.5 + Math.random() * 2.5,
      };
    });
  }

  update(dt) {
    this.ttl -= dt;
    for (const particle of this.particles) {
      particle.position = particle.position.add(particle.velocity.scale(dt));
      particle.velocity = particle.velocity.scale(Math.max(0, 1 - dt * 2));
    }
    if (this.ttl <= 0) this.dead = true;
  }
}
