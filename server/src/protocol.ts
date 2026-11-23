import { PROTOCOL_VERSION } from '../../shared/protocol.js';
export { parseClientMessage, parseClientMessage as validateMessage } from '../../shared/schema.js';
export function packet(type: string, data: Record<string, unknown> = {}): string {
  return JSON.stringify({ v: PROTOCOL_VERSION, type, ...data });
}
