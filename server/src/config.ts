import { resolve } from 'node:path';
import { z } from 'zod';
const positive = (max: number, fallback: number) => z.coerce.number<number>().int().min(1).max(max).default(fallback);
export const ServerConfigSchema = z.object({
  PORT: positive(65535, 3000), HOST: z.string().regex(/^[a-zA-Z0-9.:-]+$/).default('127.0.0.1'),
  LOG_DIR: z.string().default('./logs'), MAX_ROOMS: positive(1000, 50), MAX_PLAYERS_PER_ROOM: positive(256, 16),
});
const parsed = ServerConfigSchema.parse({ PORT: process.env.PORT || undefined, HOST: process.env.HOST || undefined, LOG_DIR: process.env.LOG_DIR || undefined, MAX_ROOMS: process.env.MAX_ROOMS || undefined, MAX_PLAYERS_PER_ROOM: process.env.MAX_PLAYERS_PER_ROOM || undefined });
export const config = Object.freeze({ host: parsed.HOST, port: parsed.PORT, logDir: resolve(parsed.LOG_DIR), maxRooms: parsed.MAX_ROOMS, maxPlayersPerRoom: parsed.MAX_PLAYERS_PER_ROOM, maxMessageBytes: 4096, maxMessagesPerSecond: 12, maxBufferedAmount: 64 * 1024 });
