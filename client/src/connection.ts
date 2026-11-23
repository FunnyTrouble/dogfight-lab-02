import { parseServerMessage } from "../../shared/schema.js";
import type { ServerMessage } from "../../shared/schema.js";
import { entityId, asTick, asSeq } from "../../shared/simulation.js";
import type { Snapshot, DecodedInput } from "../../shared/protocol.js";
import { decodeSnapshot, encodeInput } from "../../shared/protocol.js";
const VERSION = 2;

export class GameConnection extends EventTarget {
  url: string;
  socket: WebSocket | null;
  room: string | null;
  name: string | null;
  queue: Array<{type: string; [key: string]: unknown}>;
  retry: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
  closedByUser: boolean;
  constructor({ url = `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws` }: {url?: string} = {}) {
    super();
    this.url = url;
    this.socket = null;
    this.room = null;
    this.name = null;
    this.queue = [];
    this.retry = 0;
    this.retryTimer = null;
    this.closedByUser = false;
  }

  connect({ room, name }: { room: string; name: string }) {
    this.room = room;
    this.name = name;
    this.closedByUser = false;
    this.open();
  }

  open() {
    if (this.closedByUser) return;
    this.dispatchEvent(new CustomEvent("status", { detail: "connecting" }));
    const socket = new WebSocket(this.url);
    socket.binaryType = "arraybuffer";
    this.socket = socket;
    socket.addEventListener("open", () => {
      if (socket !== this.socket) return;
      this.retry = 0;
      socket.send(JSON.stringify({ v: VERSION, type: "join", room: this.room, name: this.name }));
      this.dispatchEvent(new CustomEvent("status", { detail: "connected" }));
      while (this.queue.length && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ v: VERSION, ...this.queue.shift() }));
      }
    });
    socket.addEventListener("message", (event) => {
      try {
        if (event.data instanceof ArrayBuffer) {
          const receivedAt = performance.now();
          const snapshot = decodeSnapshot(event.data);
          this.deliverSnapshot({ ...snapshot, receivedAt, bytes: event.data.byteLength });
        } else {
          const raw: unknown = JSON.parse(event.data);
          const message = parseServerMessage(raw);
          if (!message) throw new Error('Invalid server packet');
          if (message.type === "snapshot") {
            const snapshot = message.snapshot;
            this.deliverSnapshot({
              tick: asTick(snapshot.tick),
              ships: snapshot.ships.map(ship => ({...ship,kind:'ship',id:entityId(ship.id),lastAckSeq:ship.lastAckSeq === undefined ? undefined : asSeq(ship.lastAckSeq)})),
              bullets: snapshot.bullets.map(bullet => ({...bullet,kind:'bullet',id:entityId(bullet.id),owner:entityId(bullet.owner)})),
              asteroids: snapshot.asteroids?.map(asteroid => ({...asteroid,kind:'asteroid',id:entityId(asteroid.id)})) ?? [],
              receivedAt: performance.now(), bytes: event.data.length,
            });
          } else if (message.type === 'shutdown') {
            this.closedByUser = true;
            this.dispatchEvent(new CustomEvent('status', {detail:'server-shutdown'}));
            this.dispatchEvent(new CustomEvent('packet', {detail:message}));
          } else this.dispatchEvent(new CustomEvent("packet", { detail: message }));
        }
      } catch { this.dispatchEvent(new CustomEvent("status", { detail: "invalid-message" })); }
    });
    socket.addEventListener("error", () => this.dispatchEvent(new CustomEvent("status", { detail: "error" })));
    socket.addEventListener("close", () => {
      if (socket !== this.socket) return;
      this.dispatchEvent(new CustomEvent("status", { detail: "disconnected" }));
      if (!this.closedByUser) {
        const delay = Math.min(1000 * 2 ** this.retry, 15000) + Math.floor(Math.random() * 300);
        this.retry += 1;
        this.retryTimer = setTimeout(() => this.open(), delay);
      }
    });
  }

  onStatus(listener: (status: string) => void): void {
    this.addEventListener('status', event => {if (event instanceof CustomEvent && typeof event.detail === 'string') listener(event.detail);});
  }

  onPacket(listener: (message: Exclude<ServerMessage, {type:'snapshot'}>) => void): void {
    this.addEventListener('packet', event => {
      if (event instanceof CustomEvent) {
        const parsed = parseServerMessage(event.detail);
        if (parsed && parsed.type !== 'snapshot') listener(parsed);
      }
    });
  }

  onSnapshot(listener: (snapshot: Snapshot & {receivedAt:number;bytes:number}) => void): void {
    this.addEventListener('snapshot', () => {
      // deliverSnapshot is the only producer of this event, after decoding and validation.
      if (this.latestSnapshot) listener(this.latestSnapshot);
    });
  }
  latestSnapshot: (Snapshot & {receivedAt:number;bytes:number}) | null = null;

  deliverSnapshot(snapshot: Snapshot & {receivedAt: number; bytes: number}) {
    const params = new URLSearchParams(location.search);
    const lag = Math.max(0, Number(params.get("lag")) || 0);
    const jitter = Math.max(0, Number(params.get("jitter")) || 0);
    const loss = Math.max(0, Math.min(1, Number(params.get("loss")) || 0));
    if (Math.random() < loss) return;
    const delay = lag + Math.random() * jitter;
    setTimeout(() => {this.latestSnapshot = snapshot; this.dispatchEvent(new CustomEvent("snapshot", { detail: snapshot }));}, delay);
  }

  sendInput(input: DecodedInput) {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    const params = new URLSearchParams(location.search);
    const lag = Math.max(0, Number(params.get("lag")) || 0);
    const jitter = Math.max(0, Number(params.get("jitter")) || 0);
    const loss = Math.max(0, Math.min(1, Number(params.get("loss")) || 0));
    if (Math.random() < loss) return;
    const data = params.has("json") && params.get("json") === "1"
      ? JSON.stringify({ v: VERSION, type: "input", ...input })
      : encodeInput(input);
    const send = () => { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(data); };
    const delay = lag + Math.random() * jitter;
    if (delay > 0) setTimeout(send, delay); else send();
  }

  send(type: string, data: Record<string, unknown> = {}) {
    const message = { type, ...data };
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ v: VERSION, ...message }));
    else {
      if (this.queue.length >= 50) this.queue.shift();
      this.queue.push(message);
    }
  }

  close() {
    this.closedByUser = true;
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.send("leave");
    this.socket?.close(1000, "left room");
  }
}
