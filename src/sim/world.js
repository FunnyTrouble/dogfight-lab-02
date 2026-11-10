import { Vector2 } from "./vector2.js";
import { Asteroid } from "./asteroid.js";
import { Pickup } from "./pickup.js";
import { Explosion } from "./explosion.js";

export class World {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.entities = new Map();
    this.player = null;
    this.spawnTimer = 0;
    this.pickupTimer = 0;
  }

  spawn(entity) {
    this.entities.set(entity.id, entity);
    if (entity.kind === "ship" && !this.player) this.player = entity;
    return entity;
  }

  despawn(idOrEntity) {
    const entity =
      typeof idOrEntity === "number" ? this.get(idOrEntity) : idOrEntity;
    if (entity) entity.dead = true;
  }

  get(id) {
    return this.entities.get(id);
  }

  *[Symbol.iterator]() {
    yield* this.entities.values();
  }

  *ofKind(kind) {
    for (const entity of this.entities.values()) {
      if (entity.kind === kind && !entity.dead) yield entity;
    }
  }

  step(dt, inputs) {
    this.spawnTimer -= dt;
    this.pickupTimer -= dt;
    if (this.spawnTimer <= 0 && [...this.ofKind("asteroid")].length < 7) {
      this.spawnRandomAsteroid();
      this.spawnTimer = 1.1;
    }
    if (this.pickupTimer <= 0 && [...this.ofKind("pickup")].length < 2) {
      this.spawn(
        new Pickup(
          30 + Math.random() * Math.max(1, this.width - 60),
          30 + Math.random() * Math.max(1, this.height - 60),
        ),
      );
      this.pickupTimer = 7;
    }

    for (const entity of this.entities.values()) {
      // The player continues updating while dead so its respawn timer can expire.
      if (!entity.dead || entity.kind === "ship")
        entity.update(dt, this, inputs);
    }

    this.resolveCollisions();
    for (const entity of this.entities.values()) {
      if (entity.kind !== "explosion" && entity.kind !== "pickup") {
        entity.position = new Vector2(
          (entity.position.x + this.width) % this.width,
          (entity.position.y + this.height) % this.height,
        );
      }
      if (entity.kind === "pickup") {
        entity.position = new Vector2(
          Math.max(
            entity.radius,
            Math.min(this.width - entity.radius, entity.position.x),
          ),
          Math.max(
            entity.radius,
            Math.min(this.height - entity.radius, entity.position.y),
          ),
        );
      }
    }
    this.sweep();
  }

  resolveCollisions() {
    const objects = [...this.entities.values()].filter(
      (entity) => !entity.dead && entity.kind !== "explosion",
    );
    // Deliberately simple O(n²) circle-circle collision system.
    for (let i = 0; i < objects.length; i += 1) {
      for (let j = i + 1; j < objects.length; j += 1) {
        const a = objects[i];
        const b = objects[j];
        if (a.dead || b.dead) continue;
        if (a.position.sub(b.position).length() >= a.radius + b.radius)
          continue;
        if (a.kind === "bullet" && ["asteroid", "ship"].includes(b.kind))
          this.hit(a, b);
        else if (b.kind === "bullet" && ["asteroid", "ship"].includes(a.kind))
          this.hit(b, a);
        else if (a.kind === "ship" && b.kind === "pickup") this.collect(a, b);
        else if (b.kind === "ship" && a.kind === "pickup") this.collect(b, a);
        else if (a.kind === "ship" && b.kind === "asteroid")
          this.shipHitsAsteroid(a, b);
        else if (b.kind === "ship" && a.kind === "asteroid")
          this.shipHitsAsteroid(b, a);
      }
    }
  }

  hit(bullet, target) {
    if (bullet.dead || target.dead) return;
    if (
      target.kind === "ship" &&
      (target.invulnerable > 0 || target === bullet.owner)
    )
      return;
    bullet.dead = true;
    if (target.kind === "asteroid") {
      target.damage(bullet.damage);
      if (target.dead) {
        if (this.player) this.player.score += 10;
        this.spawn(new Explosion(target.position, 16));
      }
    } else {
      target.damage(bullet.damage);
      if (target.dead) {
        target.respawnTimer = 2;
        this.spawn(new Explosion(target.position, 24));
      }
    }
  }

  collect(ship, pickup) {
    if (ship.dead || pickup.dead) return;
    pickup.dead = true;
    ship.heal(1);
    ship.score += 25;
    this.spawn(new Explosion(pickup.position, 8));
  }

  shipHitsAsteroid(ship, asteroid) {
    if (ship.dead || asteroid.dead || ship.invulnerable > 0) return;
    const distance = ship.position.sub(asteroid.position).length();
    if (distance >= ship.radius + asteroid.radius) return;
    ship.damage(1);
    ship.invulnerable = 1;
    asteroid.damage(1);
    this.spawn(new Explosion(ship.position, 10));
    if (ship.dead) ship.respawnTimer = 2;
  }

  respawnShip(ship) {
    const position = this.findSafePosition(ship.radius);
    ship.position = position;
    ship.velocity = new Vector2();
    ship.angle = -Math.PI / 2;
    ship.dead = false;
    ship.invulnerable = 2;
    // Reset health only when a new life begins.
    ship.restoreHealth();
  }

  findSafePosition(radius) {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const candidate = new Vector2(
        radius + Math.random() * Math.max(1, this.width - 2 * radius),
        radius + Math.random() * Math.max(1, this.height - 2 * radius),
      );
      const safe = [...this.ofKind("asteroid")].every(
        (asteroid) =>
          asteroid.position.sub(candidate).length() >
          asteroid.radius + radius + 35,
      );
      if (safe) return candidate;
    }
    return new Vector2(this.width / 2, this.height / 2);
  }

  spawnRandomAsteroid() {
    const edge = Math.floor(Math.random() * 4);
    const x =
      edge < 2 ? (edge === 0 ? 0 : this.width) : Math.random() * this.width;
    const y =
      edge >= 2 ? (edge === 2 ? 0 : this.height) : Math.random() * this.height;
    const velocity = Vector2.fromAngle(Math.random() * Math.PI * 2).scale(
      20 + Math.random() * 45,
    );
    this.spawn(new Asteroid(x, y, velocity, 16 + Math.random() * 16));
  }

  sweep() {
    for (const [id, entity] of this.entities) {
      // Keep the player object in the world while its two-second respawn timer runs.
      if (entity.dead && !(entity.kind === "ship" && this.player === entity)) {
        this.entities.delete(id);
      }
    }
  }
}
