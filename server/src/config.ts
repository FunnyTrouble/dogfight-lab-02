import { resolve } from 'node:path';
import { z } from 'zod';
const positive = (max: number, fallback: number) => z.coerce.number<number>().int().min(1).max(max).default(fallback);
export const ServerConfigSchema = z.object({
  PORT: positive(65535, 3000),
  HOST: z.string().regex(/^[a-zA-Z0-9.:-]+$/).default('0.0.0.0'),
  LOG_DIR: z.string().default('./logs'),
  LOG_LEVEL: z.enum(['trace','debug','info','warn','error','fatal','silent']).default('info'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000'),
  MAX_CONNECTIONS_PER_IP: positive(256, 8),
  TRUST_PROXY: z.enum(['true','false']).default('false'),
  MAX_ROOMS: positive(1000, 50),
  MAX_PLAYERS_PER_ROOM: positive(256, 16),
  GIT_SHA: z.string().max(80).default('local'),
});
const parsed = ServerConfigSchema.parse(process.env);
export const config = Object.freeze({
  host: parsed.HOST, port: parsed.PORT, logDir: resolve(parsed.LOG_DIR),
  logLevel: parsed.LOG_LEVEL, allowedOrigins: parsed.ALLOWED_ORIGINS.split(',').map(x=>x.trim()).filter(Boolean),
  maxConnectionsPerIp: parsed.MAX_CONNECTIONS_PER_IP, trustProxy: parsed.TRUST_PROXY === 'true',
  maxRooms: parsed.MAX_ROOMS, maxPlayersPerRoom: parsed.MAX_PLAYERS_PER_ROOM,
  gitSha: parsed.GIT_SHA,
  maxMessageBytes: 4096, maxMessagesPerSecond: 12, maxBufferedAmount: 64*1024,
});
