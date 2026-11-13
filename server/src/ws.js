import { WebSocketServer, WebSocket } from "ws";
import { packet, validateMessage } from "./protocol.js";

export function attachWebSocketServer(server, roomManager, config) {
  const wss = new WebSocketServer({
    server,
    path: "/ws",
    maxPayload: config.maxMessageBytes,
  });
  const sockets = new Set();

  wss.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("error", (error) =>
      console.error("WebSocket error:", error.message),
    );
    socket.isAlive = true;
    socket.missedPongs = 0;
    socket.room = null;
    socket.player = null;
    socket.messageTimes = [];
    const joinTimer = setTimeout(() => {
      if (!socket.player) socket.close(4001, "join timeout");
    }, 5000);

    socket.on("pong", () => {
      socket.isAlive = true;
      socket.missedPongs = 0;
    });
    socket.on("message", (data, isBinary) => {
      if (isBinary) {
        socket.close(4002, "text JSON required");
        return;
      }
      if (Buffer.byteLength(data) > config.maxMessageBytes) {
        socket.close(4009, "message too large");
        return;
      }
      const now = Date.now();
      socket.messageTimes = socket.messageTimes.filter(
        (time) => now - time < 1000,
      );
      socket.messageTimes.push(now);
      if (socket.messageTimes.length > config.maxMessagesPerSecond) {
        socket.close(4029, "rate limit");
        return;
      }
      let message;
      try {
        message = JSON.parse(data.toString());
      } catch {
        socket.close(4002, "invalid JSON");
        return;
      }
      const checked = validateMessage(message);
      if (!checked.ok) {
        console.warn("Rejected WebSocket message:", checked.reason);
        socket.close(4002, checked.reason.slice(0, 100));
        return;
      }
      const value = checked.value;
      try {
        if (value.type === "join") {
          if (socket.player) {
            socket.close(4002, "already joined");
            return;
          }
          const room = roomManager.get(value.room);
          if (!room) {
            socket.close(4004, "room not found");
            return;
          }
          const player = { name: value.name };
          room.join(player, socket);
          socket.room = room;
          socket.player = player;
          clearTimeout(joinTimer);
          socket.send(packet("joined", { room: room.id, name: player.name }));
        } else if (value.type === "chat") {
          if (!socket.room) {
            socket.close(4001, "join first");
            return;
          }
          socket.room.chat(socket, value.text);
        } else if (value.type === "leave") {
          socket.room?.leave(socket);
          socket.room = null;
          socket.player = null;
          socket.close(1000, "left room");
        }
      } catch (error) {
        socket.send(packet("error", { message: error.message }));
        if (error.message.includes("заповнена"))
          socket.close(4003, "room full");
      }
    });
    socket.on("close", () => {
      clearTimeout(joinTimer);
      sockets.delete(socket);
      socket.room?.leave(socket);
      socket.room = null;
    });
  });

  const heartbeat = setInterval(() => {
    for (const socket of sockets) {
      if (socket.isAlive === false) socket.missedPongs += 1;
      if (socket.missedPongs >= 2) {
        socket.terminate();
        continue;
      }
      socket.isAlive = false;
      if (socket.readyState === WebSocket.OPEN) socket.ping();
    }
  }, 15000);
  heartbeat.unref();

  return {
    wss,
    async close() {
      clearInterval(heartbeat);
      for (const socket of sockets) socket.close(1001, "server shutdown");
      await new Promise((resolve) => {
        const timer = setTimeout(() => {
          for (const socket of sockets) socket.terminate();
          resolve();
        }, 1000);
        wss.close(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    },
  };
}
