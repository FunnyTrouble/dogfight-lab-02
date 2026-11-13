export const PROTOCOL_VERSION = 1;
const NAME_RE = /^[\p{L}\p{N}_ -]{1,20}$/u;

export function validateMessage(message) {
  if (!message || typeof message !== "object" || Array.isArray(message))
    return { ok: false, reason: "message must be an object" };
  if (message.v !== PROTOCOL_VERSION)
    return { ok: false, reason: "unsupported protocol version" };
  switch (message.type) {
    case "join":
      if (
        typeof message.room !== "string" ||
        !/^[a-z0-9-]{1,40}$/.test(message.room)
      )
        return { ok: false, reason: "invalid room" };
      if (
        typeof message.name !== "string" ||
        !NAME_RE.test(message.name.trim())
      )
        return { ok: false, reason: "invalid name" };
      return {
        ok: true,
        value: { type: "join", room: message.room, name: message.name.trim() },
      };
    case "chat":
      if (
        typeof message.text !== "string" ||
        !message.text.trim() ||
        message.text.length > 500
      )
        return { ok: false, reason: "invalid chat text" };
      return { ok: true, value: { type: "chat", text: message.text.trim() } };
    case "leave":
      return { ok: true, value: { type: "leave" } };
    default:
      return { ok: false, reason: "unknown message type" };
  }
}

export function packet(type, data = {}) {
  return JSON.stringify({ v: PROTOCOL_VERSION, type, ...data });
}
