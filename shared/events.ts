import type { EntityId } from './simulation.js';
export type GameEvents = { fired: { shooter: EntityId }; hit: { target: EntityId; damage: number }; exploded: { entity: EntityId } };
export class Bus<Events extends object> {
  private handlers: { [K in keyof Events]?: Set<(payload: Events[K]) => void> } = {};
  on<K extends keyof Events>(name: K, listener: (payload: Events[K]) => void): () => void {
    const set = this.handlers[name] ?? new Set<(payload: Events[K]) => void>();
    set.add(listener); this.handlers[name] = set;
    return () => { set.delete(listener); };
  }
  emit<K extends keyof Events>(name: K, payload: Events[K]): void {
    for (const listener of this.handlers[name] ?? []) listener(payload);
  }
}
