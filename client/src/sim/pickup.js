import { Entity } from "./entity.js";
import { Vector2 } from "./vector2.js";

// Pickup is a stationary, collidable Entity. It does not inherit from Ship.
export class Pickup extends Entity {
  constructor(x, y) {
    super({
      position: new Vector2(x, y),
      velocity: new Vector2(),
      radius: 11,
      kind: "pickup",
    });
    this.rotation = 0;
  }

  update(dt) {
    this.rotation += dt * 1.5;
  }
}
