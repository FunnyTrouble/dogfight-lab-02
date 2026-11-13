import { EventEmitter } from "node:events";
import { MatchLog } from "./log/matchlog.js";

export class Room extends EventEmitter {
  constructor(
    { id, name, description, width = 1100, height = 700, asteroids = 8 },
    { logDir, maxPlayers },
  ) {
    super();
    this.id = id;
    this.name = name;
    this.description = description;
    this.width = width;
    this.height = height;
    this.asteroids = asteroids;
    this.players = new Map();
    this.maxPlayers = maxPlayers;
    this.matchLog = new MatchLog(this, logDir);
    this.matchLog.start().catch((error) => this.emit("error", error));
    this.on("error", (error) => console.error(`[room:${this.id}]`, error));
  }

  join(player, socket) {
    if (this.players.size >= this.maxPlayers)
      throw new Error("Кімната заповнена");
    this.players.set(socket, player);
    this.publish("join", { player: player.name });
    this.broadcast({
      type: "system",
      text: `${player.name} приєднався(-лася) до кімнати.`,
    });
    this.broadcastRoster();
  }

  leave(socket) {
    const player = this.players.get(socket);
    if (!player) return;
    this.players.delete(socket);
    this.publish("leave", { player: player.name });
    this.broadcast({
      type: "system",
      text: `${player.name} вийшов(-ла) з кімнати.`,
    });
    this.broadcastRoster();
    if (this.players.size === 0) this.emit("empty", this);
  }

  chat(socket, text) {
    const player = this.players.get(socket);
    if (!player) throw new Error("Спочатку потрібно увійти до кімнати");
    const message = { type: "chat", name: player.name, text, at: Date.now() };
    this.publish("chat", { player: player.name, text });
    this.broadcast(message);
  }

  publish(type, details = {}) {
    this.emit("event", { t: Date.now(), type, ...details });
  }

  broadcastRoster() {
    this.broadcast({
      type: "roster",
      players: [...this.players.values()].map((player) => player.name),
    });
  }

  broadcast(message) {
    const data = JSON.stringify({ v: 1, ...message });
    for (const socket of this.players.keys()) {
      if (socket.readyState !== 1) continue;
      if (socket.bufferedAmount > 64 * 1024 && message.type !== "roster")
        continue;
      try {
        socket.send(data);
      } catch (error) {
        this.emit("error", error);
      }
    }
  }

  async close() {
    await this.matchLog.close();
  }
}

export class RoomManager extends EventEmitter {
  constructor({ logDir, maxRooms, maxPlayersPerRoom, initialRooms = [] }) {
    super();
    this.logDir = logDir;
    this.maxRooms = maxRooms;
    this.maxPlayersPerRoom = maxPlayersPerRoom;
    this.rooms = new Map();
    this.allRooms = new Set();
    this.on("error", (error) => console.error("RoomManager error:", error));
    for (const room of initialRooms) this.create(room, { seeded: true });
  }

  create(details, { seeded = false } = {}) {
    if (this.rooms.size >= this.maxRooms)
      throw new Error("Досягнуто ліміту кімнат");
    const id = String(details.id || "").toLowerCase();
    if (!/^[a-z0-9-]{1,40}$/.test(id) || this.rooms.has(id))
      throw new Error("Некоректний або зайнятий ID кімнати");
    const room = new Room(
      {
        ...details,
        id,
        name: String(details.name || id).slice(0, 40),
        description: String(details.description || "Кімната для гри").slice(
          0,
          120,
        ),
      },
      { logDir: this.logDir, maxPlayers: this.maxPlayersPerRoom },
    );
    this.rooms.set(id, room);
    this.allRooms.add(room);
    room.seeded = seeded;
    room.once("empty", () => {
      if (!room.seeded && this.rooms.get(id) === room) this.rooms.delete(id);
      if (!room.seeded)
        room.close().catch((error) => this.emit("error", error));
    });
    this.emit("created", room);
    return room;
  }

  get(id) {
    return this.rooms.get(id);
  }
  list() {
    return [...this.rooms.values()].map(
      ({ id, name, description, width, height, asteroids, players }) => ({
        id,
        name,
        description,
        width,
        height,
        asteroids,
        players: players.size,
      }),
    );
  }
  async close() {
    await Promise.all([...this.allRooms].map((room) => room.close()));
  }
}
