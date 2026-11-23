// Binary protocol v2. All multi-byte fields are little-endian.
// Input: 12 bytes. Snapshot: 11-byte header + 28 bytes per ship + 24 per bullet + 24 per asteroid.
export const PROTOCOL_VERSION = 2;
export const INPUT_PACKET_BYTES = 12;
const INPUT_TYPE = 1;
const SNAPSHOT_TYPE = 2;

export function encodeInput({ seq, tick, thrust, turn, fire }) {
  const buffer = new ArrayBuffer(INPUT_PACKET_BYTES);
  const view = new DataView(buffer);
  view.setUint8(0, PROTOCOL_VERSION); view.setUint8(1, INPUT_TYPE);
  view.setUint32(2, seq >>> 0, true); view.setUint32(6, tick >>> 0, true);
  const flags = (thrust ? 1 : 0) | (fire ? 2 : 0);
  view.setUint8(10, flags); view.setInt8(11, Math.max(-1, Math.min(1, turn)));
  return buffer;
}

export function decodeInput(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength !== INPUT_PACKET_BYTES) throw new Error('Invalid input packet length');
  const view = new DataView(buffer);
  if (view.getUint8(0) !== PROTOCOL_VERSION || view.getUint8(1) !== INPUT_TYPE) throw new Error('Unsupported input packet');
  const flags = view.getUint8(10);
  return { seq: view.getUint32(2, true), tick: view.getUint32(6, true), thrust: Boolean(flags & 1), fire: Boolean(flags & 2), turn: Math.max(-1, Math.min(1, view.getInt8(11))) };
}

export function encodeSnapshot(snapshot) {
  const ships = snapshot.ships || []; const bullets = snapshot.bullets || []; const asteroids = snapshot.asteroids || [];
  const shipBytes = 28; const bulletBytes = 24;
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
    view.setUint32(offset, ship.lastAckSeq >>> 0, true); offset += 4;
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
    for (const key of ['x', 'y', 'vx', 'vy', 'radius']) { view.setFloat32(offset, asteroid[key], true); offset += 4; }
  }
  return buffer;
}

export function decodeSnapshot(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 11) throw new Error('Invalid snapshot packet');
  const view = new DataView(buffer);
  if (view.getUint8(0) !== PROTOCOL_VERSION || view.getUint8(1) !== SNAPSHOT_TYPE) throw new Error('Unsupported snapshot packet');
  const tick = view.getUint32(2, true); const shipCount = view.getUint8(6); const bulletCount = view.getUint16(7, true); const asteroidCount = view.getUint16(9, true);
  if (buffer.byteLength !== 11 + shipCount * 28 + bulletCount * 24 + asteroidCount * 24) throw new Error('Snapshot length mismatch');
  const ships = []; const bullets = []; const asteroids = []; let offset = 11;
  for (let i = 0; i < shipCount; i += 1) {
    const id = view.getUint32(offset, true); offset += 4;
    const x = view.getFloat32(offset, true); offset += 4;
    const y = view.getFloat32(offset, true); offset += 4;
    const vx = view.getFloat32(offset, true); offset += 4;
    const vy = view.getFloat32(offset, true); offset += 4;
    const angle = view.getInt16(offset, true) / 32767 * Math.PI; offset += 2;
    const hp = view.getUint8(offset++); const score = view.getUint8(offset++);
    const lastAckSeq = view.getUint32(offset, true); offset += 4;
    ships.push({ id, x, y, vx, vy, angle, hp, score, lastAckSeq });
  }
  for (let i = 0; i < bulletCount; i += 1) {
    const id = view.getUint32(offset, true); offset += 4;
    const owner = view.getUint32(offset, true); offset += 4;
    const x = view.getFloat32(offset, true); offset += 4;
    const y = view.getFloat32(offset, true); offset += 4;
    const vx = view.getFloat32(offset, true); offset += 4;
    const vy = view.getFloat32(offset, true); offset += 4;
    bullets.push({ id, owner, x, y, vx, vy });
  }
  for (let i = 0; i < asteroidCount; i += 1) {
    const id = view.getUint32(offset, true); offset += 4;
    const asteroid = { id };
    for (const key of ['x', 'y', 'vx', 'vy', 'radius']) { asteroid[key] = view.getFloat32(offset, true); offset += 4; }
    asteroids.push(asteroid);
  }
  return { tick, ships, bullets, asteroids };
}
