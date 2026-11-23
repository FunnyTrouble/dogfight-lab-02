/** An immutable vector for shared simulation and snapshot geometry. */
export class Vector2 {
  constructor(public readonly x: number, public readonly y: number) {}
  add(other: Readonly<Vector2>): Vector2 {return new Vector2(this.x + other.x, this.y + other.y)}
  sub(other: Readonly<Vector2>): Vector2 {return new Vector2(this.x - other.x, this.y - other.y)}
  scale(amount: number): Vector2 {return new Vector2(this.x * amount, this.y * amount)}
  length(): number {return Math.hypot(this.x,this.y)}
  normalize(): Vector2 {const length = this.length(); return length ? this.scale(1/length) : new Vector2(0,0)}
}
