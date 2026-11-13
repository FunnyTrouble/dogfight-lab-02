import { resolve } from "node:path";

function positiveInteger(value, fallback, name, max = 100000) {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    throw new Error(`${name} має бути цілим числом від 1 до ${max}`);
  }
  return parsed;
}

const port = positiveInteger(process.env.PORT, 3000, "PORT", 65535);
const host = process.env.HOST || "127.0.0.1";
if (!/^[a-zA-Z0-9.:-]+$/.test(host))
  throw new Error("HOST має некоректний формат");

export const config = Object.freeze({
  host,
  port,
  logDir: resolve(process.env.LOG_DIR || "./logs"),
  maxRooms: positiveInteger(process.env.MAX_ROOMS, 50, "MAX_ROOMS", 1000),
  maxPlayersPerRoom: positiveInteger(
    process.env.MAX_PLAYERS_PER_ROOM,
    16,
    "MAX_PLAYERS_PER_ROOM",
    256,
  ),
  maxMessageBytes: 4096,
  maxMessagesPerSecond: 12,
  maxBufferedAmount: 64 * 1024,
});
