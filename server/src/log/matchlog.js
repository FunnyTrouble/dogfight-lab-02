import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { PassThrough, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

class NdjsonTransform extends Transform {
  constructor() {
    super({ writableObjectMode: true });
  }

  _transform(event, _encoding, callback) {
    try {
      callback(null, `${JSON.stringify(event)}\n`);
    } catch (error) {
      callback(error);
    }
  }
}

export class MatchLog {
  constructor(room, logDir) {
    this.room = room;
    this.logDir = logDir;
    this.input = new PassThrough({
      objectMode: true,
      highWaterMark: 16,
    });

    this.pending = [];
    this.waitingDrain = false;
    this.accepting = true;
    this.failure = null;
    this.flushWaiters = [];
    this.closePromise = null;

    this.fileName = `${room.id}-${Date.now()}.ndjson`;
    this.filePath = join(logDir, this.fileName);
    this.onEvent = (event) => this.write(event);
    this.task = null;
  }

  async start() {
    await mkdir(this.logDir, { recursive: true });

    this.task = pipeline(
      this.input,
      new NdjsonTransform(),
      createWriteStream(this.filePath, { flags: "wx" }),
    );

    this.task.catch((error) => {
      this.failure = error;
      this.settleFlushWaiters(error);
      this.room.emit("error", error);
    });

    this.room.on("event", this.onEvent);

    this.write({
      t: Date.now(),
      type: "match-start",
      room: this.room.id,
    });
  }

  write(event) {
    if (!this.accepting || this.failure) return;

    this.pending.push(event);
    this.pump();
  }

  pump() {
    if (this.failure) {
      this.settleFlushWaiters(this.failure);
      return;
    }

    if (this.waitingDrain) return;

    while (this.pending.length > 0) {
      const event = this.pending.shift();

      if (!this.input.write(event)) {
        this.waitingDrain = true;

        this.input.once("drain", () => {
          this.waitingDrain = false;
          this.pump();
        });

        return;
      }
    }

    this.settleFlushWaiters();
  }

  settleFlushWaiters(error = null) {
    if (!error && (this.pending.length > 0 || this.waitingDrain)) {
      return;
    }

    const waiters = this.flushWaiters.splice(0);

    for (const waiter of waiters) {
      if (error) waiter.reject(error);
      else waiter.resolve();
    }
  }

  async close() {
    if (this.closePromise) return this.closePromise;

    this.accepting = false;
    this.room.off("event", this.onEvent);

    this.closePromise = (async () => {
      if (!this.task) {
        await mkdir(this.logDir, { recursive: true });
        this.task = pipeline(
          this.input,
          new NdjsonTransform(),
          createWriteStream(this.filePath, { flags: "wx" }),
        );

        this.task.catch((error) => {
          this.failure = error;
          this.settleFlushWaiters(error);
          this.room.emit("error", error);
        });
      }

      await new Promise((resolve, reject) => {
        this.flushWaiters.push({ resolve, reject });
        this.pump();
      });

      this.input.end();
      await this.task;
    })();

    return this.closePromise;
  }

  static safeFileName(id) {
    const file = basename(id);

    if (file !== id || !/^[a-z0-9-]+-\d+\.ndjson$/.test(file)) {
      return null;
    }

    return file;
  }
}
