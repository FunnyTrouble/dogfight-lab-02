import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
class HttpError extends Error { status = 0 }
function errMessage(error: unknown): string {return error instanceof Error ? error.message : String(error)}
function errStatus(error: unknown): number | undefined {return error instanceof HttpError ? error.status : undefined}
const RoomBodySchema = z.object({id: z.string().optional(),name: z.string().trim().min(1).max(40), description: z.string().max(120).optional(), asteroids: z.number().int().min(1).max(20).optional()});
const RoomSeedSchema = z.object({rooms: z.array(z.object({id:z.string(), name:z.string(), description:z.string(), width:z.number().optional(), height:z.number().optional(),asteroids:z.number().optional()}))});
import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { config } from "./config.js";
import { RoomManager } from "./rooms.js";
import { MatchLog } from "./log/matchlog.js";
import { attachWebSocketServer } from "./ws.js";

const here = fileURLToPath(new URL("..", import.meta.url));
const clientDist = resolve(here, "../client/dist");
const seedPath = resolve(here, "../client/public/api/rooms");
const mimeTypes: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".wav": "audio/wav", ".ico": "image/x-icon" };

await mkdir(config.logDir, { recursive: true });
let initialRooms: import("./rooms.js").RoomDetails[] = [{ id: "classic", name: "Classic Arena", description: "Звичайна арена для тренування", width: 1100, height: 700, asteroids: 8 }, { id: "easy", name: "Easy Arena", description: "Менше астероїдів для початківців", width: 1100, height: 700, asteroids: 4 }, { id: "hard", name: "Hard Arena", description: "Більше астероїдів і складніша гра", width: 1100, height: 700, asteroids: 14 }];
try { const parsed = RoomSeedSchema.safeParse(JSON.parse(await readFile(seedPath, "utf8"))); if (parsed.success) initialRooms = parsed.data.rooms; } catch { /* use defaults */ }
const roomManager = new RoomManager({ logDir: config.logDir, maxRooms: config.maxRooms, maxPlayersPerRoom: config.maxPlayersPerRoom, initialRooms });

function sendJson(res: ServerResponse, status: number, body: unknown) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": data.length, "cache-control": "no-store" });
  res.end(data);
}

async function readBody(req: IncomingMessage, limit = 8192): Promise<string> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) { const error = new HttpError("Request body too large"); error.status = 413; throw error; }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function serveStatic(pathname: string, res: ServerResponse) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { sendJson(res, 400, { error: "Invalid URL encoding" }); return; }
  if (decoded.includes("\\") || decoded.split("/").includes("..")) { sendJson(res, 403, { error: "Path traversal blocked" }); return; }
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const filePath = resolve(clientDist, relative);
  if (filePath !== clientDist && !filePath.startsWith(`${clientDist}${sep}`)) { sendJson(res, 403, { error: "Forbidden" }); return; }
  try {
    const info = await stat(filePath);
    if (!info.isFile()) { sendJson(res, 404, { error: "Not found" }); return; }
    res.writeHead(200, { "content-type": mimeTypes[extname(filePath)] || "application/octet-stream", "content-length": info.size, "x-content-type-options": "nosniff" });
    await pipeline(createReadStream(filePath), res);
  } catch (error) {
    if (!res.headersSent) sendJson(res, 404, { error: "Not found", detail: error instanceof Error && "code" in error && error.code === "ENOENT" ? undefined : errMessage(error) });
    else res.destroy(error instanceof Error ? error : new Error(errMessage(error)));
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || `${config.host}:${config.port}`}`);
    if (req.method === "GET" && url.pathname === "/health") { sendJson(res, 200, { ok: true, uptime: Math.round(process.uptime()), rooms: roomManager.rooms.size }); return; }
    if (req.method === "GET" && url.pathname === "/api/slow") {
      const started = Date.now();
      while (Date.now() - started < 300) { /* Deliberately block the event loop for the lab experiment. */ }
      sendJson(res, 200, { blockedMs: Date.now() - started, warning: "This route deliberately blocks the event loop." });
      return;
    }
    if (url.pathname === "/api/rooms" && req.method === "GET") { sendJson(res, 200, { rooms: roomManager.list() }); return; }
    if (url.pathname === "/api/rooms" && req.method === "POST") {
      let body;
      try { body = JSON.parse(await readBody(req)); } catch (error) { sendJson(res, errStatus(error) || 400, { error: errStatus(error) ? errMessage(error) : "Invalid JSON" }); return; }
      const parsedBody = RoomBodySchema.safeParse(body);
      if (!parsedBody.success) {sendJson(res,400,{error:"Invalid room parameters"});return;}
      body = parsedBody.data;
      const slug = String(body.id || body.name).trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
      const id = slug || `room-${Date.now()}`;
      try { const room = roomManager.create({ id, name: body.name.trim(), description: typeof body.description === "string" ? body.description.slice(0, 120) : "Створена гравцем", asteroids: body.asteroids ?? 8 }); sendJson(res, 201, { room: { id: room.id, name: room.name, description: room.description, asteroids: room.asteroids, players: 0 } }); }
      catch (error: unknown) { sendJson(res, 409, { error: errMessage(error) }); }
      return;
    }
    const replayMatch = url.pathname.match(/^\/api\/replays\/([^/]+)$/);
    if (req.method === "GET" && replayMatch) {
      let decodedId;
      try { decodedId = decodeURIComponent(replayMatch[1] ?? ""); } catch { sendJson(res, 400, { error: "Invalid replay id" }); return; }
      const name = MatchLog.safeFileName(decodedId);
      if (!name) { sendJson(res, 400, { error: "Invalid replay id" }); return; }
      const path = resolve(config.logDir, name);
      if (!path.startsWith(`${config.logDir}${sep}`)) { sendJson(res, 403, { error: "Forbidden" }); return; }
      try { const info = await stat(path); res.writeHead(200, { "content-type": "application/x-ndjson; charset=utf-8", "content-length": info.size, "content-disposition": `attachment; filename="${name}"` }); await pipeline(createReadStream(path), res); }
      catch (error) { if (!res.headersSent) sendJson(res, 404, { error: "Replay not found" }); else res.destroy(error instanceof Error ? error : new Error(errMessage(error))); }
      return;
    }
    if (req.method === "GET" || req.method === "HEAD") { await serveStatic(url.pathname, res); return; }
    sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    console.error("HTTP handler error:", error);
    if (!res.headersSent) sendJson(res, 500, { error: "Internal server error" }); else res.destroy(error instanceof Error ? error : new Error(errMessage(error)));
  }
});

const ws = attachWebSocketServer(server, roomManager, config);
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal}: shutting down`);
  const forceTimer = setTimeout(() => { console.error("Shutdown timeout"); process.exit(1); }, 8000);
  forceTimer.unref();
  try {
    await ws.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await roomManager.close();
    clearTimeout(forceTimer);
    console.log("Server stopped; logs flushed.");
    process.exitCode = 0;
  } catch (error) {
    console.error("Shutdown failed:", error);
    process.exitCode = 1;
  }
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
server.on("error", (error) => { console.error("HTTP server error:", error); void shutdown("server error"); });
server.listen(config.port, config.host, () => console.log(`Dogfight Lab 06 listening at http://${config.host}:${config.port}`));
