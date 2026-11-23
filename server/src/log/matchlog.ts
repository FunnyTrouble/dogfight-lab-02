import type { TransformCallback } from "node:stream";
import type { Room, RoomEvent } from "../rooms.js";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { PassThrough, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

class NdjsonTransform extends Transform {
  constructor() { super({ writableObjectMode: true }); }
  _transform(event: unknown, _encoding: BufferEncoding, callback: TransformCallback) {
    try { callback(null, `${JSON.stringify(event)}\n`); }
    catch (error: unknown) { callback(error instanceof Error ? error : new Error(String(error))); }
  }
}

export class MatchLog {
  readonly room: Room;
  readonly logDir: string;
  readonly input: PassThrough;
  readonly pending: RoomEvent[];
  waitingDrain: boolean;
  closed: boolean;
  readonly fileName: string;
  readonly filePath: string;
  readonly onEvent: (event: RoomEvent) => void;
  task: Promise<void> | null;
  constructor(room: Room, logDir: string) {
    this.room = room;
    this.logDir = logDir;
    this.input = new PassThrough({ objectMode: true, highWaterMark: 16 });
    this.pending = [];
    this.waitingDrain = false;
    this.closed = false;
    this.fileName = `${room.id}-${Date.now()}.ndjson`;
    this.filePath = join(logDir, this.fileName);
    this.onEvent = (event) => this.write(event);
    this.task = null;
  }

  async start() {
    await mkdir(this.logDir, { recursive: true });
    this.task = pipeline(this.input, new NdjsonTransform(), createWriteStream(this.filePath, { flags: "wx" }));
    this.task.catch((error: unknown) => this.room.emit("error", error instanceof Error ? error : new Error(String(error))));
    this.room.on("event", this.onEvent);
    this.write({ t: Date.now(), type: "match-start", room: this.room.id });
  }

  write(event: RoomEvent) {
    if (this.closed) return;
    if (this.waitingDrain) { this.pending.push(event); return; }
    if (!this.input.write(event)) this.waitingDrain = true;
    if (this.waitingDrain) this.input.once("drain", () => {
      this.waitingDrain = false;
      while (this.pending.length && !this.waitingDrain) {
        if (!this.input.write(this.pending.shift())) this.waitingDrain = true;
      }
    });
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    this.room.off("event", this.onEvent);
    this.input.end();
    await this.task;
  }

  static safeFileName(id: string) {
    const file = basename(id);
    if (file !== id || !/^[a-z0-9-]+-\d+\.ndjson$/.test(file)) return null;
    return file;
  }
}
