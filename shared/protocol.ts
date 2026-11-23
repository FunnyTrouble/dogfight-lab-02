import { entityId, asTick, asSeq } from './simulation.js';
import type { SnapshotShip, SnapshotBullet, Asteroid, Input, Tick, Seq } from './simulation.js';
export type Snapshot = { readonly tick: Tick; readonly ships: readonly SnapshotShip[]; readonly bullets: readonly SnapshotBullet[]; readonly asteroids?: readonly Asteroid[] };
export type DecodedInput = Input & { readonly tick: Tick; readonly seq: Seq };
function finite(value: number, name: string): number { if (!Number.isFinite(value)) throw new Error(`Non-finite ${name}`); return value; }
const ASTEROID_FLOAT_KEYS: Array<'x' | 'y' | 'vx' | 'vy' | 'radius'> = ['x', 'y', 'vx', 'vy', 'radius']; // fixed binary field tuple
// Binary protocol v2. All multi-byte fields are little-endian.
// Input: 12 bytes. Snapshot: 11-byte header + 28 bytes per ship + 24 per bullet + 24 per asteroid.
export const PROTOCOL_VERSION = 2;
export const INPUT_PACKET_BYTES = 12;
const INPUT_TYPE = 1;
const SNAPSHOT_TYPE = 2;

export function encodeInput({ seq, tick, thrust, turn, fire }: DecodedInput): ArrayBuffer {
  const buffer = new ArrayBuffer(INPUT_PACKET_BYTES);
  const view = new DataView(buffer);
  view.setUint8(0, PROTOCOL_VERSION); view.setUint8(1, INPUT_TYPE);
  view.setUint32(2, seq >>> 0, true); view.setUint32(6, tick >>> 0, true);
  const flags = (thrust ? 1 : 0) | (fire ? 2 : 0);
  if (!Number.isInteger(turn) || turn < -1 || turn > 1 || seq === 0) throw new Error("Invalid input values");
  view.setUint8(10, flags); view.setInt8(11, Math.max(-1, Math.min(1, turn)));
  return buffer;
}

export function decodeInput(buffer: ArrayBuffer): DecodedInput {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength !== INPUT_PACKET_BYTES) throw new Error('Invalid input packet length');
  const view = new DataView(buffer);
  if (view.getUint8(0) !== PROTOCOL_VERSION || view.getUint8(1) !== INPUT_TYPE) throw new Error('Unsupported input packet');
  const flags = view.getUint8(10);
  if (flags & ~3 || view.getInt8(11) < -1 || view.getInt8(11) > 1 || view.getUint32(2,true) === 0) throw new Error('Invalid input fields');
  return { seq: asSeq(view.getUint32(2, true)), tick: asTick(view.getUint32(6, true)), thrust: Boolean(flags & 1), fire: Boolean(flags & 2), turn: Math.max(-1, Math.min(1, view.getInt8(11))) };
}

export function encodeSnapshot(snapshot: Snapshot): ArrayBuffer {
  const ships = snapshot.ships || []; const bullets = snapshot.bullets || []; const asteroids = snapshot.asteroids || [];
  const shipBytes = 28; const bulletBytes = 24;
  if (ships.length > 255 || bullets.length > 65535 || asteroids.length > 65535) throw new Error('Snapshot entity count exceeds protocol range');
  const buffer = new ArrayBuffer(11 + ships.length * shipBytes + bullets.length * bulletBytes + asteroids.length * 24);
  const view = new DataView(buffer);
  view.setUint8(0, PROTOCOL_VERSION); view.setUint8(1, SNAPSHOT_TYPE);
  view.setUint32(2, snapshot.tick >>> 0, true); view.setUint8(6, ships.length); view.setUint16(7, bullets.length, true); view.setUint16(9, asteroids.length, true);
  let offset = 11;
  for (const ship of ships) {
    view.setUint32(offset, ship.id >>> 0, true); offset += 4;
    view.setFloat32(offset, ship.x, true); offset += 4;
    view.setFloat32(offset, ship.y, true); offset += 4;
    view.setFloat32(offset, ship.vx, true); offset += 4;
    view.setFloat32(offset, ship.vy, true); offset += 4;
    view.setInt16(offset, Math.round(((ship.angle + Math.PI) % (2 * Math.PI) - Math.PI) / Math.PI * 32767), true); offset += 2;
    view.setUint8(offset++, ship.hp); view.setUint8(offset++, ship.score & 255);
    view.setUint32(offset, (ship.lastAckSeq ?? 0) >>> 0, true); offset += 4;
  }
  for (const bullet of bullets) {
    view.setUint32(offset, bullet.id >>> 0, true); offset += 4;
    view.setUint32(offset, bullet.owner >>> 0, true); offset += 4;
    view.setFloat32(offset, bullet.x, true); offset += 4;
    view.setFloat32(offset, bullet.y, true); offset += 4;
    view.setFloat32(offset, bullet.vx, true); offset += 4;
    view.setFloat32(offset, bullet.vy, true); offset += 4;
  }
  for (const asteroid of asteroids) {
    view.setUint32(offset, asteroid.id >>> 0, true); offset += 4;
    for (const key of ASTEROID_FLOAT_KEYS) { view.setFloat32(offset, asteroid[key], true); offset += 4; }
  }
  return buffer;
}

export function decodeSnapshot(buffer: ArrayBuffer): Snapshot {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 11) throw new Error('Invalid snapshot packet');
  const view = new DataView(buffer);
  if (view.getUint8(0) !== PROTOCOL_VERSION || view.getUint8(1) !== SNAPSHOT_TYPE) throw new Error('Unsupported snapshot packet');
  const tick = asTick(view.getUint32(2, true)); const shipCount = view.getUint8(6); const bulletCount = view.getUint16(7, true); const asteroidCount = view.getUint16(9, true);
  if (buffer.byteLength !== 11 + shipCount * 28 + bulletCount * 24 + asteroidCount * 24) throw new Error('Snapshot length mismatch');
  const ships: SnapshotShip[] = []; const bullets: SnapshotBullet[] = []; const asteroids: Asteroid[] = []; let offset = 11;
  for (let i = 0; i < shipCount; i += 1) {
    const id = view.getUint32(offset, true); offset += 4;
    const x = view.getFloat32(offset, true); offset += 4;
    const y = view.getFloat32(offset, true); offset += 4;
    const vx = view.getFloat32(offset, true); offset += 4;
    const vy = view.getFloat32(offset, true); offset += 4;
    const angle = view.getInt16(offset, true) / 32767 * Math.PI; offset += 2;
    const hp = view.getUint8(offset++); const score = view.getUint8(offset++);
    if (hp > 3) throw new Error('Invalid ship health');
    const lastAckSeq = asSeq(view.getUint32(offset, true)); offset += 4;
    ships.push({kind:'ship', id: entityId(id), x, y, vx, vy, angle, hp, score, lastAckSeq });
  }
  for (let i = 0; i < bulletCount; i += 1) {
    const id = view.getUint32(offset, true); offset += 4;
    const owner = view.getUint32(offset, true); offset += 4;
    const x = view.getFloat32(offset, true); offset += 4;
    const y = view.getFloat32(offset, true); offset += 4;
    const vx = view.getFloat32(offset, true); offset += 4;
    const vy = view.getFloat32(offset, true); offset += 4;
    bullets.push({kind:'bullet', id: entityId(id), owner: entityId(owner), x, y, vx, vy });
  }
  for (let i = 0; i < asteroidCount; i += 1) {
    const id = view.getUint32(offset, true); offset += 4;
    const asteroid: Asteroid = { kind:'asteroid',id: entityId(id), x: 0, y: 0, vx: 0, vy: 0, radius: 0 };
    for (const key of ASTEROID_FLOAT_KEYS) { asteroid[key] = view.getFloat32(offset, true); offset += 4; }
    asteroids.push(asteroid);
  }
  for (const ship of ships) { for (const value of [ship.x,ship.y,ship.vx,ship.vy,ship.angle]) finite(value, 'ship'); }
  for (const bullet of bullets) { for (const value of [bullet.x,bullet.y,bullet.vx,bullet.vy]) finite(value, 'bullet'); }
  for (const asteroid of asteroids) { for (const value of [asteroid.x,asteroid.y,asteroid.vx,asteroid.vy,asteroid.radius]) finite(value, 'asteroid'); if (asteroid.radius <= 0 || asteroid.radius > 1000) throw new Error('Invalid asteroid radius'); }
  return { tick, ships, bullets, asteroids };
}
