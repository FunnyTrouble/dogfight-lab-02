// Immutable 2D vector: every operation returns a new Vector2.
export class Vector2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  add(other) {
    return new Vector2(this.x + other.x, this.y + other.y);
  }

  sub(other) {
    return new Vector2(this.x - other.x, this.y - other.y);
  }

  scale(value) {
    return new Vector2(this.x * value, this.y * value);
  }

  length() {
    return Math.hypot(this.x, this.y);
  }

  normalize() {
    const magnitude = this.length();
    return magnitude === 0 ? new Vector2() : this.scale(1 / magnitude);
  }

  rotate(angle) {
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    return new Vector2(
      this.x * cosine - this.y * sine,
      this.x * sine + this.y * cosine,
    );
  }

  dot(other) {
    return this.x * other.x + this.y * other.y;
  }

  static fromAngle(angle) {
    return new Vector2(Math.cos(angle), Math.sin(angle));
  }
}
