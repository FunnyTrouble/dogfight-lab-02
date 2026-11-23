import test from "node:test";
import assert from "node:assert/strict";
import { createShip, integrateShip, stepWorld, DT } from "../../shared/simulation.js";
import { encodeInput, decodeInput, encodeSnapshot, decodeSnapshot } from "../../shared/protocol.js";

test("binary input round-trips with version, sequence and flags", () => {
  const input = { seq: 42, tick: 17, thrust: true, turn: -1, fire: true };
  assert.deepEqual(decodeInput(encodeInput(input)), input);
});

test("binary snapshots round-trip ships, acknowledged input and bullets", () => {
  const original = { tick: 99, ships: [{ id: 3, x: 10.5, y: 20, vx: 1, vy: -2, angle: -1.2, hp: 2, score: 4, lastAckSeq: 12 }], bullets: [{ id: 7, owner: 3, x: 12, y: 22, vx: 100, vy: -30 }] };
  const decoded = decodeSnapshot(encodeSnapshot(original));
  assert.equal(decoded.tick, original.tick);
  assert.deepEqual(decoded.ships[0], { ...original.ships[0], angle: Math.round(original.ships[0].angle / Math.PI * 32767) / 32767 * Math.PI });
  assert.deepEqual(decoded.bullets, original.bullets);
  assert.deepEqual(decoded.asteroids, []);
});

test("shared integration is deterministic for identical input", () => {
  const a = createShip(1, "A", 123); const b = createShip(1, "A", 123);
  for (let i = 0; i < 60; i += 1) { integrateShip(a, { thrust: true, turn: i % 2 ? 1 : -1, fire: false }, DT); integrateShip(b, { thrust: true, turn: i % 2 ? 1 : -1, fire: false }, DT); }
  assert.deepEqual(a, b);
  const world = { tick: 0, ships: [a], bullets: [], nextBulletId: 1 };
  stepWorld(world, new Map([[1, { thrust: false, turn: 0, fire: true, seq: 61 }]]), DT);
  assert.equal(world.tick, 1);
  assert.equal(world.bullets.length, 1);
});


test("seeded asteroids are deterministic and round-trip through binary snapshots", async () => {
  const { createAsteroids } = await import("../../shared/simulation.js");
  const a = createAsteroids(5, 1234);
  assert.deepEqual(a, createAsteroids(5, 1234));
  const decoded = decodeSnapshot(encodeSnapshot({ tick: 1, ships: [], bullets: [], asteroids: a }));
  assert.equal(decoded.asteroids.length, 5);
  assert.equal(decoded.asteroids[0].id, a[0].id);
  assert.ok(Math.abs(decoded.asteroids[0].x - a[0].x) < 0.001);
});

test("server destroys an asteroid hit by a bullet", async () => {
  const { stepWorld } = await import("../../shared/simulation.js");
  const state = { tick: 0, ships: [], bullets: [{ id: 1, owner: 7, x: 50, y: 50, vx: 0, vy: 0, life: 1 }], asteroids: [{ id: 1, x: 50, y: 50, vx: 0, vy: 0, radius: 20 }], nextBulletId: 2 };
  stepWorld(state, new Map());
  assert.equal(state.asteroids.length, 0);
  assert.equal(state.bullets.length, 0);
});
