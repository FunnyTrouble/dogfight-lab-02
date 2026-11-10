# Dogfight — Lab 02: Objects, Prototypes, and `this`

## Run the project

```bash
npm install
npm run dev
```

Controls: **W / ↑** thrust, **A/D / ←/→** rotate, **Space / F** regular shot, **H** homing shot. Destroy asteroids for points, collect green pickups to restore health, and avoid collisions. After losing all health the ship respawns after two seconds.

## What is implemented

- `Vector2`: immutable `add`, `sub`, `scale`, `length`, `normalize`, `rotate`, `dot`, and `fromAngle`.
- `Entity`: common `id`, `position`, `velocity`, `radius`, `kind`, `dead`, and `update`; IDs come from a private module counter.
- `Ship extends Entity`: one inheritance level, private `#hp` with getter, thrust, rotation, firing and respawn.
- `Bullet`, `Asteroid`, `Pickup`, `Explosion`: entities with different update behavior; bullets have a TTL.
- `World`: stores entities in `Map`, supports `spawn`, `despawn`, `get`, iteration and `ofKind(kind)`, resolves circle collisions and removes dead entities in `sweep()`.
- Circle collisions: deliberately simple O(n²) pair checks. Bullets damage asteroids/ships; destruction creates particle explosions. Asteroid destruction and pickups add score.
- A ship has three health points. A pickup restores one health point (up to three). When health reaches zero, the ship respawns after two seconds at a position chosen to avoid asteroids.
- The homing bullet uses a **composed behavior object** (`createHomingBehavior`) rather than a special inheritance branch.

## `this`: the event-handler bug and fixes

For ordinary functions, the practical `this` binding rules from strongest to weakest are:

1. **Constructor call:** `new Fn()` binds `this` to the new instance.
2. **Explicit binding:** `call`, `apply`, or `bind` supplies the receiver.
3. **Implicit method call:** `object.method()` makes `this === object`.
4. **Default call:** a plain function call has `this === undefined` in strict mode (class methods/modules are strict); in non-strict classic scripts it defaults to the global object.

Arrow functions are different: they capture `this` from the surrounding scope and do not get a new `this` from the call site.

In `setTimeout(ship.fire, 100)`, the callback is detached from `ship`; its `this` is **not the ship**. The timer API may invoke a normal callback with a global receiver in a browser, but it does not restore the original object receiver. Class methods are strict, so this still does not make `this` equal to `ship`.

A class method uses the receiver supplied by the call site. Passing `ship.fire` alone to an event listener loses the `ship` receiver:

```js
button.addEventListener("click", ship.fire); // wrong: this is not ship
```

Three fixes:

```js
button.addEventListener("click", () => ship.fire(world)); // arrow wrapper
button.addEventListener("click", ship.fire.bind(ship, world)); // bind receiver/argument
button.addEventListener("click", function () {
  ship.fire(world);
}); // normal wrapper
```

Trade-offs: the arrow wrapper creates a new function and captures surrounding variables; `bind` creates a new function that you must keep a reference to if you later want to remove the listener; the normal wrapper is more verbose and has its own `this`, although it explicitly calls `ship.fire` so that does not matter here. Do not register `ship.fire` directly. In this game firing is called as `this.fire(world)` from `Ship.update`, so its receiver is preserved.

Arrow functions do not have their own `this`, so `.bind(...)` cannot change their `this`. Arrows are useful for callbacks that should capture the surrounding `this`; they are usually a poor choice for a shared prototype method that needs a different instance receiver for every object.

## Composition vs inheritance (design note)

Inheritance is used only for the shared “is an entity” relationship: `Ship`, `Bullet`, `Asteroid`, `Pickup`, and `Explosion` are all entities. It is not used to build combinations such as `HomingBullet extends Bullet extends Entity` and `HomingAsteroid extends Asteroid extends Entity`. Instead, a bullet may hold a `behavior` object and delegate its homing update to it. The same behavior could be attached to another moving object without adding another subclass. `Pickup` is an `Entity` with its own stationary update and collision handling; it is not a `Ship`, so it does not inherit ship-only health, controls, or firing.

## Why `Map` instead of a plain object?

1. It is designed for key/value collections and accepts numeric IDs directly.
2. It provides predictable iteration over entities and convenient `values()` / `entries()`.
3. It has explicit collection operations such as `set`, `get`, `has`, and `delete`, and a reliable `size`.

## Prototype experiment

Open the browser console and run:

```js
const base = {
  describe() {
    return `Entity: ${this.kind}`;
  },
};
const asteroid = Object.create(base);
asteroid.kind = "asteroid";
asteroid.describe(); // "Entity: asteroid" — delegated to base
const method = asteroid.describe;
method(); // this is undefined in strict mode (module)
method.call(asteroid); // "Entity: asteroid" — receiver supplied explicitly
```

`class` syntax is built on JavaScript's prototype system. `new Ship(...)` creates an object, connects it to `Ship.prototype`, calls the constructor with that object as `this`, and returns the instance (unless the constructor explicitly returns another object).

## Before submission

- [ ] `npm run dev` — test movement, regular shot and homing shot.
- [ ] Shoot asteroids; confirm hits/destruction, explosions and score.
- [ ] Collect a green pickup; confirm health/score update.
- [ ] Take damage and verify the two-second respawn.
- [ ] `npm run build`, `npm run lint`, and `npm run format:check`.
- [ ] Commit changes and create tag `lab-02` after testing.
