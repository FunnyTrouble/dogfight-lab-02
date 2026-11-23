import type { WebSocket } from 'ws';
import type {Seq} from '../../shared/simulation.js';
import type { Room } from './rooms.js';
export interface Player { name: string; id: number; lastAckSeq: Seq }
export type GameSocket = WebSocket & {
  isAlive: boolean;
  missedPongs: number;
  room: Room | null;
  player: Player | null;
  playerId?: number;
  inputTimes: number[];
  messageTimes: number[];
  jsonProtocol: boolean;
};
