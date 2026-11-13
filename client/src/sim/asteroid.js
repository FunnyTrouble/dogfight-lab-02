import { Entity } from "./entity.js";
import { Vector2 } from "./vector2.js";

export class Asteroid extends Entity {
  constructor(x, y, velocity = new Vector2(), radius = 22) {
    super({ position: new Vector2(x, y), velocity, radius, kind: "asteroid" });
    this.hp = radius > 24 ? 3 : 2;
    this.angle = Math.random() * Math.PI * 2;
    this.spin = (Math.random() - 0.5) * 1.5;
  }

  update(dt, world) {
    this.angle += this.spin * dt;
    super.update(dt, world);
  }

  damage(amount = 1) {
    this.hp -= amount;
    if (this.hp <= 0) this.dead = true;
  }
}
