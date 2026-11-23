import { Entity } from "./entity.js";
import { Vector2 } from "./vector2.js";
import { Bullet } from "./bullet.js";

const ROTATION_SPEED = 3.5;
const THRUST_POWER = 180;
const DRAG = 0.35;
const MAX_SPEED = 420;

export class Ship extends Entity {
  #hp = 3;

  constructor(x, y) {
    super({ position: new Vector2(x, y), radius: 15, kind: "ship" });
    this.angle = -Math.PI / 2;
    this.thrust = false;
    this.fireCooldown = 0;
    this.respawnTimer = 0;
    this.score = 0;
    this.invulnerable = 0;
  }

  get hp() {
    return this.#hp;
  }

  damage(amount = 1) {
    this.#hp = Math.max(0, this.#hp - amount);
    if (this.#hp === 0) this.dead = true;
  }

  heal(amount = 1) {
    this.#hp = Math.min(3, this.#hp + amount);
  }

  restoreHealth() {
    this.#hp = 3;
  }

  fire(world, { homing = false } = {}) {
    if (this.dead || this.fireCooldown > 0) return null;
    const direction = Vector2.fromAngle(this.angle);
    const nose = this.position.add(direction.scale(this.radius + 4));
    const bullet = new Bullet(
      nose,
      this.velocity.add(direction.scale(homing ? 260 : 360)),
      { homing },
    );
    bullet.owner = this;
    world.spawn(bullet);
    world.dispatchEvent(new CustomEvent("fired", { detail: { ship: this, bullet } }));
    this.fireCooldown = 0.24;
    return bullet;
  }

  update(dt, world, inputs) {
    if (this.dead) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) world.respawnShip(this);
      return;
    }

    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    if (inputs.isDown("KeyA") || inputs.isDown("ArrowLeft"))
      this.angle -= ROTATION_SPEED * dt;
    if (inputs.isDown("KeyD") || inputs.isDown("ArrowRight"))
      this.angle += ROTATION_SPEED * dt;

    this.thrust = inputs.isDown("KeyW") || inputs.isDown("ArrowUp");
    if (this.thrust) {
      this.velocity = this.velocity.add(
        Vector2.fromAngle(this.angle).scale(THRUST_POWER * dt),
      );
    }
    this.velocity = this.velocity.scale(Math.max(0, 1 - DRAG * dt));
    const speed = this.velocity.length();
    if (speed > MAX_SPEED)
      this.velocity = this.velocity.scale(MAX_SPEED / speed);
    this.position = this.position.add(this.velocity.scale(dt));

    // Space is edge-triggered. Calling through this.fire() preserves the receiver.
    if (inputs.justPressed("Space") || inputs.justPressed("KeyF")) {
      this.fire(world);
    } else if (inputs.justPressed("KeyH")) {
      this.fire(world, { homing: true });
    }
  }
}
