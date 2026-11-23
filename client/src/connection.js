import { decodeSnapshot, encodeInput } from "../../shared/protocol.js";
const VERSION = 2;

export class GameConnection extends EventTarget {
  constructor({ url = `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws` } = {}) {
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

  connect({ room, name }) {
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
          const message = JSON.parse(event.data);
          if (message.type === "snapshot") this.deliverSnapshot({ ...message.snapshot, receivedAt: performance.now(), bytes: event.data.length });
          else this.dispatchEvent(new CustomEvent("packet", { detail: message }));
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

  deliverSnapshot(snapshot) {
    const params = new URLSearchParams(location.search);
    const lag = Math.max(0, Number(params.get("lag")) || 0);
    const jitter = Math.max(0, Number(params.get("jitter")) || 0);
    const loss = Math.max(0, Math.min(1, Number(params.get("loss")) || 0));
    if (Math.random() < loss) return;
    const delay = lag + Math.random() * jitter;
    setTimeout(() => this.dispatchEvent(new CustomEvent("snapshot", { detail: snapshot })), delay);
  }

  sendInput(input) {
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

  send(type, data = {}) {
    const message = { type, ...data };
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ v: VERSION, ...message }));
    else {
      if (this.queue.length >= 50) this.queue.shift();
      this.queue.push(message);
    }
  }

  close() {
    this.closedByUser = true;
    clearTimeout(this.retryTimer);
    this.send("leave");
    this.socket?.close(1000, "left room");
  }
}
