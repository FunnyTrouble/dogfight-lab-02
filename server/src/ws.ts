import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import type { RawData } from 'ws';
import { packet, parseClientMessage } from './protocol.js';
import { decodeInput } from '../../shared/protocol.js';
import type { RoomManager } from './rooms.js';
import type { Player, GameSocket } from './socket.js';
import {asSeq} from '../../shared/simulation.js';
import type { Room } from './rooms.js';
const noRoom = (): Room | null => null;
const noPlayer = (): Player | null => null;
const noTimes = (): number[] => [];
import type { config } from './config.js';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function underLimit(events: number[], max: number): boolean {
  const now = Date.now();
  events.splice(0, events.length, ...events.filter((time) => now - time < 1000));
  events.push(now);
  return events.length <= max;
}

export function attachWebSocketServer(
  server: Server,
  roomManager: RoomManager,
  settings: typeof config,
): {wss: WebSocketServer; close: () => Promise<void>} {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: settings.maxMessageBytes });
  const sockets = new Set<GameSocket>();

  wss.on('connection', (rawSocket) => {
    // Object.assign extends a ws socket with its session fields without a type cast.
    const socket = Object.assign(rawSocket, {
      isAlive: true,
      missedPongs: 0,
      room: noRoom(),
      player: noPlayer(),
      playerId: 0,
      inputTimes: noTimes(),
      messageTimes: noTimes(),
      jsonProtocol: false,
    });
    sockets.add(socket);
    socket.on('error', (error: Error) => console.error('WebSocket error:', error.message));
    const joinTimer = setTimeout(() => {
      if (!socket.player) socket.close(4001, 'join timeout');
    }, 5000);

    socket.on('pong', () => { socket.isAlive = true; socket.missedPongs = 0; });
    socket.on('message', (data: RawData, isBinary: boolean) => {
      if (isBinary) {
        try {
          if (!socket.room) { socket.close(4001, 'join first'); return; }
          if (!underLimit(socket.inputTimes, 45)) { socket.close(4029, 'input rate limit'); return; }
          const packetBuffer = Buffer.isBuffer(data) ? data : Buffer.concat(Array.isArray(data) ? data : [Buffer.from(data)]);
          const arrayBuffer = new ArrayBuffer(packetBuffer.byteLength);
          new Uint8Array(arrayBuffer).set(packetBuffer);
          const input = decodeInput(arrayBuffer);
          socket.room.acceptInput(socket, input);
        } catch (error: unknown) {
          console.warn('Rejected binary input:', errorMessage(error));
          socket.close(4002, errorMessage(error).slice(0, 100));
        }
        return;
      }
      const raw = Buffer.isBuffer(data) ? data.toString('utf8') : data.toString();
      if (Buffer.byteLength(raw) > settings.maxMessageBytes) { socket.close(4009, 'message too large'); return; }
      let parsed: unknown;
      try { parsed = JSON.parse(raw); }
      catch (error: unknown) { console.warn('Invalid JSON:', errorMessage(error)); socket.close(4002, 'invalid JSON'); return; }
      const checked = parseClientMessage(parsed);
      if (!checked.ok) { console.warn('Rejected WebSocket message:', checked.reason); socket.close(4002, checked.reason.slice(0, 100)); return; }
      const message = checked.value;
      if (message.type !== 'input' && !underLimit(socket.messageTimes, settings.maxMessagesPerSecond)) {
        socket.close(4029, 'rate limit'); return;
      }
      try {
        switch (message.type) {
          case 'input': {
            if (!socket.room) { socket.close(4001, 'join first'); return; }
            if (!underLimit(socket.inputTimes, 45)) { socket.close(4029, 'input rate limit'); return; }
            socket.jsonProtocol = true;
            socket.room.acceptInput(socket, message);
            return;
          }
          case 'join': {
            if (socket.player) { socket.close(4002, 'already joined'); return; }
            const room = roomManager.get(message.room);
            if (!room) { socket.close(4004, 'room not found'); return; }
            const player: Player = {name: message.name, id: 0, lastAckSeq: asSeq(0)};
            room.join(player, socket);
            socket.room = room;
            socket.player = player;
            clearTimeout(joinTimer);
            socket.send(packet('joined', {room: room.id, name: player.name, id: player.id}));
            return;
          }
          case 'chat': {
            if (!socket.room) { socket.close(4001, 'join first'); return; }
            socket.room.chat(socket, message.text);
            return;
          }
          case 'leave': {
            socket.room?.leave(socket);
            socket.room = null;
            socket.player = null;
            socket.close(1000, 'left room');
            return;
          }
          default: {
            const impossible: never = message;
            return impossible;
          }
        }
      } catch (error: unknown) {
        const messageText = errorMessage(error);
        console.warn('Message handling failed:', messageText);
        socket.send(packet('error', {message: messageText}));
        if (messageText.includes('заповнена')) socket.close(4003, 'room full');
      }
    });
    socket.on('close', () => {
      clearTimeout(joinTimer);
      sockets.delete(socket);
      socket.room?.leave(socket);
      socket.room = null;
    });
  });

  const heartbeat = setInterval(() => {
    for (const socket of sockets) {
      if (socket.isAlive === false) socket.missedPongs += 1;
      if (socket.missedPongs >= 2) {socket.terminate();continue;}
      socket.isAlive = false;
      if (socket.readyState === WebSocket.OPEN) socket.ping();
    }
  }, 15000);
  heartbeat.unref();

  return {
    wss,
    async close(): Promise<void> {
      clearInterval(heartbeat);
      for (const socket of sockets) socket.close(1001, 'server shutdown');
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => { for (const socket of sockets) socket.terminate(); resolve(); }, 1000);
        wss.close(() => { clearTimeout(timer); resolve(); });
      });
    },
  };
}
