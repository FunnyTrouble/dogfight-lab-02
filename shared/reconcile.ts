import { integrateShip, DT } from './simulation.js';
import type { Ship, Input, Seq } from './simulation.js';
/** Rebuild predicted state from a server snapshot and inputs not yet acknowledged. */
export function reconcileShip(confirmed: Ship, pending: readonly Input[], ack: Seq): { ship: Ship; pending: Input[] } {
  const ship = { ...confirmed };
  const remaining: Input[] = [];
  for (const command of pending) {
    if (command.seq <= ack) continue;
    remaining.push(command);
    integrateShip(ship, command, DT);
  }
  return { ship, pending: remaining };
}
