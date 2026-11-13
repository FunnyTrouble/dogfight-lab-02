const VERSION = 1;

export class GameConnection extends EventTarget {
  constructor({
    url = `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`,
  } = {}) {
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
    this.socket = socket;
    socket.addEventListener("open", () => {
      if (socket !== this.socket) return;
      this.retry = 0;
      socket.send(
        JSON.stringify({
          v: VERSION,
          type: "join",
          room: this.room,
          name: this.name,
        }),
      );
      this.dispatchEvent(new CustomEvent("status", { detail: "connected" }));
      while (this.queue.length && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ v: VERSION, ...this.queue.shift() }));
      }
    });
    socket.addEventListener("message", (event) => {
      try {
        this.dispatchEvent(
          new CustomEvent("packet", { detail: JSON.parse(event.data) }),
        );
      } catch {
        this.dispatchEvent(
          new CustomEvent("status", { detail: "invalid-message" }),
        );
      }
    });
    socket.addEventListener("error", () =>
      this.dispatchEvent(new CustomEvent("status", { detail: "error" })),
    );
    socket.addEventListener("close", () => {
      if (socket !== this.socket) return;
      this.dispatchEvent(new CustomEvent("status", { detail: "disconnected" }));
      if (!this.closedByUser) {
        const delay =
          Math.min(1000 * 2 ** this.retry, 15000) +
          Math.floor(Math.random() * 300);
        this.retry += 1;
        this.retryTimer = setTimeout(() => this.open(), delay);
      }
    });
  }

  send(type, data = {}) {
    const message = { type, ...data };
    if (this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify({ v: VERSION, ...message }));
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
