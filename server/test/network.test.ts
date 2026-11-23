import test from "node:test";
import assert from "node:assert/strict";
import { createShip, integrateShip, stepWorld, DT, entityId, asTick, asSeq } from "../../shared/simulation.js";
import type { WorldState } from "../../shared/simulation.js";
import { encodeInput, decodeInput, encodeSnapshot, decodeSnapshot } from "../../shared/protocol.js";
import type {Snapshot} from "../../shared/protocol.js";

test("binary input round-trips with version, sequence and flags", () => {
  const input = { seq: asSeq(42), tick: asTick(17), thrust: true, turn: -1, fire: true };
  assert.deepEqual(decodeInput(encodeInput(input)), input);
});

test("binary snapshots round-trip ships, acknowledged input and bullets", () => {
  const original: Snapshot = { tick: asTick(99), ships: [{ kind:'ship', id: entityId(3), x: 10.5, y: 20, vx: 1, vy: -2, angle: -1.2, hp: 2, score: 4, lastAckSeq: asSeq(12) }], bullets: [{ kind:'bullet', id: entityId(7), owner: entityId(3), x: 12, y: 22, vx: 100, vy: -30 }] };
  const decoded = decodeSnapshot(encodeSnapshot(original));
  assert.equal(decoded.tick, original.tick);
  assert.deepEqual(decoded.ships[0], { ...original.ships[0], angle: Math.round(original.ships[0]!.angle / Math.PI * 32767) / 32767 * Math.PI });
  assert.deepEqual(decoded.bullets, original.bullets);
  assert.deepEqual(decoded.asteroids, []);
});

test("shared integration is deterministic for identical input", () => {
  const a = createShip(1, "A", 123); const b = createShip(1, "A", 123);
  for (let i = 0; i < 60; i += 1) { integrateShip(a, { thrust: true, turn: i % 2 ? 1 : -1, fire: false, seq: asSeq(i) }, DT); integrateShip(b, { thrust: true, turn: i % 2 ? 1 : -1, fire: false, seq: asSeq(i) }, DT); }
  assert.deepEqual(a, b);
  const world = { tick: asTick(0), ships: [a], bullets: [], nextBulletId: 1 };
  stepWorld(world, new Map([[1, { thrust: false, turn: 0, fire: true, seq: asSeq(61) }]]), DT);
  assert.equal(world.tick, 1);
  assert.equal(world.bullets.length, 1);
});


test("seeded asteroids are deterministic and round-trip through binary snapshots", async () => {
  const { createAsteroids } = await import("../../shared/simulation.js");
  const a = createAsteroids(5, 1234);
  assert.deepEqual(a, createAsteroids(5, 1234));
  const decoded = decodeSnapshot(encodeSnapshot({ tick: asTick(1), ships: [], bullets: [], asteroids: a }));
  assert.equal(decoded.asteroids?.length, 5);
  assert.equal(decoded.asteroids?.[0]?.id, a[0]!.id);
  assert.ok(Math.abs((decoded.asteroids?.[0]?.x ?? 0) - a[0]!.x) < 0.001);
});

test("server destroys an asteroid hit by a bullet", async () => {
  const { stepWorld } = await import("../../shared/simulation.js");
  const state: WorldState = { tick: asTick(0), ships: [], bullets: [{ kind:'bullet', id: entityId(1), owner: entityId(7), x: 50, y: 50, vx: 0, vy: 0, life: 1 }], asteroids: [{ kind:'asteroid', id: entityId(1), x: 50, y: 50, vx: 0, vy: 0, radius: 20 }], nextBulletId: 2 };
  stepWorld(state, new Map());
  assert.equal(state.asteroids?.length, 0);
  assert.equal(state.bullets.length, 0);
});

test("decoder rejects wrong binary lengths and invalid input flags", () => {
  assert.throws(() => decodeInput(new ArrayBuffer(3)), /length/);
  const malformed = encodeInput({seq: asSeq(1), tick: asTick(1), thrust:false,turn:0,fire:false});
  new DataView(malformed).setUint8(10, 128);
  assert.throws(() => decodeInput(malformed), /Invalid input fields/);
});

test("decoder rejects invalid snapshot health and nonfinite coordinates", () => {
  const snapshot = encodeSnapshot({tick:asTick(1), ships:[{kind:'ship',id:entityId(1),x:10,y:12,vx:0,vy:0,angle:0,hp:3,score:0}],bullets:[],asteroids:[]});
  const view = new DataView(snapshot);
  view.setUint8(11 + 4 + 4*4 + 2, 255);
  assert.throws(() => decodeSnapshot(snapshot), /health/);
  view.setUint8(11 + 4 + 4*4 + 2, 3);
  view.setFloat32(15, Number.NaN, true);
  assert.throws(() => decodeSnapshot(snapshot), /Non-finite/);
});
