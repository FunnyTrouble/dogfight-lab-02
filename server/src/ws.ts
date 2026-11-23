import { WebSocketServer, WebSocket } from 'ws';
import type { Server, IncomingMessage } from 'node:http';
import { logger } from './logger.js';
import { traffic, rejectMetric } from './metrics.js';
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
  const wss = new WebSocketServer({ noServer: true, maxPayload: settings.maxMessageBytes });
  const ipCounts = new Map<string,number>();
  let accepting = true;
  function clientIp(req: IncomingMessage): string {
    const forwarded = req.headers['x-forwarded-for'];
    return (settings.trustProxy && typeof forwarded === 'string' && forwarded.length > 0) ? forwarded.split(',')[0]!.trim() : (req.socket.remoteAddress ?? 'unknown');
  }
  const upgrade = (req: IncomingMessage, socket: import('node:stream').Duplex, head: Buffer) => {
    if (new URL(req.url ?? '/', 'http://localhost').pathname !== '/ws') { socket.destroy(); return; }
    const origin = req.headers.origin;
    const ip = clientIp(req);
    const reason = !accepting ? 'shutdown' : (!origin || !settings.allowedOrigins.includes(origin)) ? 'origin' : (ipCounts.get(ip) ?? 0) >= settings.maxConnectionsPerIp ? 'ip_limit' : '';
    if (reason) { rejectMetric(reason); logger.warn({reason,ip},'ws.rejected'); socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); socket.destroy(); return; }
    try { wss.handleUpgrade(req,socket,head, ws => { wss.emit('connection',ws,req); }); }
    catch (error) { logger.error({err:error},'ws.upgrade_failed'); socket.destroy(); }
  };
  server.on('upgrade', upgrade);
  const sockets = new Set<GameSocket>();

  wss.on('connection', (rawSocket,req) => {
    const ip = clientIp(req); ipCounts.set(ip,(ipCounts.get(ip) ?? 0)+1);
    logger.info({ip},'ws.connected');
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
    socket.on('error', (error: Error) => logger.warn({err:error,ip},'ws.error')); 
    const joinTimer = setTimeout(() => {
      if (!socket.player) socket.close(4001, 'join timeout');
    }, 5000);

    socket.on('pong', () => { socket.isAlive = true; socket.missedPongs = 0; });
    socket.on('message', (data: RawData, isBinary: boolean) => {
      traffic.inMessages++; traffic.inBytes += Buffer.isBuffer(data) ? data.byteLength : Buffer.byteLength(data.toString());
      if (isBinary) {
        try {
          if (!socket.room) { socket.close(4001, 'join first'); return; }
          if (!underLimit(socket.inputTimes, 45)) { rejectMetric('input_rate'); socket.close(4029, 'input rate limit'); return; }
          const packetBuffer = Buffer.isBuffer(data) ? data : Buffer.concat(Array.isArray(data) ? data : [Buffer.from(data)]);
          const arrayBuffer = new ArrayBuffer(packetBuffer.byteLength);
          new Uint8Array(arrayBuffer).set(packetBuffer);
          const input = decodeInput(arrayBuffer);
          socket.room.acceptInput(socket, input);
        } catch (error: unknown) {
          rejectMetric('bad_binary'); logger.warn({err:errorMessage(error)},'ws.invalid_binary');
          socket.close(4002, errorMessage(error).slice(0, 100));
        }
        return;
      }
      const raw = Buffer.isBuffer(data) ? data.toString('utf8') : data.toString();
      if (Buffer.byteLength(raw) > settings.maxMessageBytes) { socket.close(4009, 'message too large'); return; }
      let parsed: unknown;
      try { parsed = JSON.parse(raw); }
      catch (error: unknown) { rejectMetric('bad_json'); logger.warn({err:errorMessage(error)},'ws.invalid_json'); socket.close(4002, 'invalid JSON'); return; }
      const checked = parseClientMessage(parsed);
      if (!checked.ok) { rejectMetric('bad_message'); logger.warn({reason:checked.reason},'ws.invalid_message'); socket.close(4002, checked.reason.slice(0, 100)); return; }
      const message = checked.value;
      if (message.type !== 'input' && !underLimit(socket.messageTimes, settings.maxMessagesPerSecond)) {
        rejectMetric('rate_limit'); socket.close(4029, 'rate limit'); return;
      }
      try {
        switch (message.type) {
          case 'input': {
            if (!socket.room) { socket.close(4001, 'join first'); return; }
            if (!underLimit(socket.inputTimes, 45)) { rejectMetric('input_rate'); socket.close(4029, 'input rate limit'); return; }
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
        logger.warn({reason:messageText},'ws.message_failed');
        socket.send(packet('error', {message: messageText}));
        if (messageText.includes('заповнена')) socket.close(4003, 'room full');
      }
    });
    socket.on('close', () => {
      clearTimeout(joinTimer);
      sockets.delete(socket);
      const count = (ipCounts.get(ip) ?? 1)-1; if (count>0) ipCounts.set(ip,count); else ipCounts.delete(ip);
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
      accepting = false;
      server.off('upgrade', upgrade);
      clearInterval(heartbeat);
      for (const socket of sockets) { if (socket.readyState === WebSocket.OPEN) { socket.send(packet('shutdown', {message:'Server is restarting'})); socket.close(1001,'server shutdown'); } }
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => { for (const socket of sockets) socket.terminate(); resolve(); }, 1000);
        wss.close(() => { clearTimeout(timer); resolve(); });
      });
    },
  };
}
