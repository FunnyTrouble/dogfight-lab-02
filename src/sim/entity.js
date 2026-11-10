import { Vector2 } from "./vector2.js";

let nextEntityId = 1;

export class Entity {
  constructor({
    position = new Vector2(),
    velocity = new Vector2(),
    radius = 10,
    kind = "entity",
  } = {}) {
    this.id = nextEntityId++;
    this.position = position;
    this.velocity = velocity;
    this.radius = radius;
    this.kind = kind;
    this.dead = false;
  }

  update(dt) {
    this.position = this.position.add(this.velocity.scale(dt));
  }
}
