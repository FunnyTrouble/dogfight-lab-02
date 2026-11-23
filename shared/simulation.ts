// Lab 06: shared deterministic simulation. No DOM or Node imports.
export type Brand<Tag extends string> = number & { readonly __brand: Tag };
export type EntityId = Brand<'EntityId'>;
export type Tick = Brand<'Tick'>;
export type Seq = Brand<'Seq'>;
// These are the only deliberate casts: a validated number acquires a nominal brand.
export const entityId = (value: number): EntityId => {
  if (!Number.isSafeInteger(value) || value < 0 || value > 4294967295) throw new Error("Invalid entity ID");
  return value as EntityId;
}; // brand at boundary
export const asTick = (value: number): Tick => {if (!Number.isSafeInteger(value) || value < 0 || value > 4294967295) throw new Error("Invalid tick"); return value as Tick;}; // brand at boundary
export const asSeq = (value: number): Seq => {if (!Number.isSafeInteger(value) || value < 0 || value > 4294967295) throw new Error("Invalid sequence"); return value as Seq;}; // brand at boundary
export interface ReadonlyVector2 { readonly x: number; readonly y: number }
export type Input = { readonly seq: Seq; readonly tick?: Tick; readonly thrust: boolean; readonly turn: number; readonly fire: boolean };
export type Ship = { kind: 'ship'; id: EntityId; name: string; x: number; y: number; vx: number; vy: number; angle: number; hp: number; score: number; fireCooldown: number; seed: number; lastAckSeq?: Seq };
export type Bullet = { kind: 'bullet'; id: EntityId; owner: EntityId; x: number; y: number; vx: number; vy: number; life: number };
export type Asteroid = { kind: 'asteroid'; id: EntityId; x: number; y: number; vx: number; vy: number; radius: number; angle?: number };
export type SnapshotShip = Pick<Ship, 'kind' | 'id' | 'x' | 'y' | 'vx' | 'vy' | 'angle' | 'hp' | 'score'> & { lastAckSeq?: Seq; name?: string };
export type SnapshotBullet = Pick<Bullet, 'kind' | 'id' | 'owner' | 'x' | 'y' | 'vx' | 'vy'>;
export type SnapshotEntity =
  | ({ readonly kind: 'ship' } & Readonly<Ship>)
  | ({ readonly kind: 'bullet' } & Readonly<Bullet>)
  | ({ readonly kind: 'asteroid' } & Readonly<Asteroid>);
export function entityLabel(entity: SnapshotEntity): string {
  switch (entity.kind) {
    case 'ship': return `ship:${entity.id}`;
    case 'bullet': return `bullet:${entity.id}`;
    case 'asteroid': return `asteroid:${entity.id}`;
    default: { const impossible: never = entity; return impossible; }
  }
}
export type WorldState = { tick: Tick; ships: Ship[]; bullets: Bullet[]; asteroids?: Asteroid[]; nextBulletId: number };
// Pure shared simulation: no DOM, Node APIs, wall-clock time, or Math.random().
export const TICK_RATE = 30;
export const DT = 1 / TICK_RATE;
export const WORLD_WIDTH = 1100;
export const WORLD_HEIGHT = 700;

export function createShip(id: number, name: string, seed: number, slot = 0): Ship {
  return { kind: 'ship', id: entityId(id), name, x: 180 + slot * 180, y: 180 + (slot % 2) * 300, vx: 0, vy: 0, angle: -Math.PI / 2, hp: 3, score: 0, fireCooldown: 0, seed: seed >>> 0 };
}

export function integrateShip(ship: Ship, input: Input, dt = DT): Ship {
  const turn = Math.max(-1, Math.min(1, Number(input.turn) || 0));
  ship.angle += turn * 3.5 * dt;
  if (input.thrust) {
    ship.vx += Math.cos(ship.angle) * 180 * dt;
    ship.vy += Math.sin(ship.angle) * 180 * dt;
  }
  const drag = Math.max(0, 1 - 0.35 * dt);
  ship.vx *= drag; ship.vy *= drag;
  const speed = Math.hypot(ship.vx, ship.vy);
  if (speed > 420) { ship.vx *= 420 / speed; ship.vy *= 420 / speed; }
  ship.x = (ship.x + ship.vx * dt + WORLD_WIDTH) % WORLD_WIDTH;
  ship.y = (ship.y + ship.vy * dt + WORLD_HEIGHT) % WORLD_HEIGHT;
  ship.fireCooldown = Math.max(0, ship.fireCooldown - dt);
  return ship;
}

// Asteroids belong to the authoritative state; only the server creates them.
export function createAsteroids(count: number, seed = 12345): Asteroid[] {
  const random = seededRandom(seed);
  return Array.from({ length: Math.max(0, Math.min(30, count)) }, (_, index) => {
    const angle = random() * Math.PI * 2;
    const speed = 15 + random() * 35;
    return { kind: 'asteroid', id: entityId(index + 1), x: 60 + random() * (WORLD_WIDTH - 120),
      y: 60 + random() * (WORLD_HEIGHT - 120), vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed, radius: 16 + random() * 16, angle: random() * Math.PI * 2 };
  });
}

export function stepWorld(state: WorldState, inputs: ReadonlyMap<number, Input>, dt = DT): WorldState {
  state.tick = asTick(state.tick + 1);
  for (const ship of state.ships) {
    const input = inputs.get(ship.id) || { thrust: false, turn: 0, fire: false, seq: asSeq(0) };
    integrateShip(ship, input, dt);
    if (input.fire && ship.fireCooldown <= 0) {
      const speed = 360;
      state.bullets.push({ kind: 'bullet', id: entityId(state.nextBulletId++), owner: ship.id, x: ship.x + Math.cos(ship.angle) * 20, y: ship.y + Math.sin(ship.angle) * 20, vx: ship.vx + Math.cos(ship.angle) * speed, vy: ship.vy + Math.sin(ship.angle) * speed, life: 1.4 });
      ship.fireCooldown = 0.24;
    }
  }
  for (const asteroid of state.asteroids || []) {
    asteroid.x = (asteroid.x + asteroid.vx * dt + WORLD_WIDTH) % WORLD_WIDTH;
    asteroid.y = (asteroid.y + asteroid.vy * dt + WORLD_HEIGHT) % WORLD_HEIGHT;
    asteroid.angle = (asteroid.angle ?? 0) + 0.25 * dt;
  }
  for (const bullet of state.bullets) {
    bullet.x = (bullet.x + bullet.vx * dt + WORLD_WIDTH) % WORLD_WIDTH;
    bullet.y = (bullet.y + bullet.vy * dt + WORLD_HEIGHT) % WORLD_HEIGHT;
    bullet.life -= dt;
  }
  const survivingBullets: Bullet[] = [];
  for (const bullet of state.bullets) {
    if (bullet.life <= 0) continue;
    const asteroid = (state.asteroids || []).find((item) =>
      Math.hypot(item.x - bullet.x, item.y - bullet.y) < item.radius + 3);
    if (asteroid) {
      state.asteroids = (state.asteroids ?? []).filter((item) => item.id !== asteroid.id);
      const owner = state.ships.find((ship) => ship.id === bullet.owner);
      if (owner) owner.score = Math.min(255, owner.score + 1);
      continue;
    }
    const target = state.ships.find((ship) => ship.id !== bullet.owner && ship.hp > 0 && Math.hypot(ship.x - bullet.x, ship.y - bullet.y) < 18);
    if (target) {
      target.hp -= 1;
      const owner = state.ships.find((ship) => ship.id === bullet.owner);
      if (owner) owner.score = Math.min(255, owner.score + 1);
      if (target.hp <= 0) { target.hp = 3; target.x = target.id % 2 ? 180 : 920; target.y = target.id % 2 ? 180 : 520; target.vx = 0; target.vy = 0; }
      continue;
    }
    survivingBullets.push(bullet);
  }
  state.bullets = survivingBullets;
  for (const ship of state.ships) {
    const asteroid = (state.asteroids || []).find((item) => Math.hypot(item.x - ship.x, item.y - ship.y) < item.radius + 15);
    if (asteroid) {
      ship.hp -= 1;
      state.asteroids = (state.asteroids ?? []).filter((item) => item.id !== asteroid.id);
      if (ship.hp <= 0) { ship.hp = 3; ship.x = ship.id % 2 ? 180 : 920; ship.y = ship.id % 2 ? 180 : 520; ship.vx = 0; ship.vy = 0; }
    }
  }
  return state;
}

export function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6D2B79F5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
