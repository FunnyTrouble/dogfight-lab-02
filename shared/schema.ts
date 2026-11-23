import { z } from 'zod';
import { PROTOCOL_VERSION } from './protocol.js';
import {asTick, asSeq} from './simulation.js';
import type {Seq, Tick} from './simulation.js';
const version = z.literal(PROTOCOL_VERSION);
const join = z.object({ v: version, type: z.literal('join'), room: z.string().regex(/^[a-z0-9-]{1,40}$/), name: z.string().trim().min(1).max(20).regex(/^[\p{L}\p{N}_ -]+$/u) });
const chat = z.object({ v: version, type: z.literal('chat'), text: z.string().trim().min(1).max(500) });
const input = z.object({ v: version, type: z.literal('input'), seq: z.number().int().positive().transform(asSeq), tick: z.number().int().nonnegative().transform(asTick), thrust: z.boolean(), turn: z.number().int().min(-1).max(1), fire: z.boolean() });
const leave = z.object({ v: version, type: z.literal('leave') });
export const ClientMessageSchema = z.discriminatedUnion('type', [join, chat, input, leave]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;
// Distributes Omit over the schema-inferred union, retaining each type discriminant.
type WithoutVersion<T> = T extends {v: number} ? Omit<T,'v'> : never;
export type ParsedClientMessage = WithoutVersion<ClientMessage>;
export type ParseResult = { ok: true; value: ParsedClientMessage } | { ok: false; reason: string };
export function parseClientMessage(data: unknown): ParseResult {
  const result = ClientMessageSchema.safeParse(data);
  if (!result.success) return { ok: false, reason: result.error.issues[0]?.message ?? 'Invalid message' };
  switch (result.data.type) {
    case 'join': return { ok: true, value: { type: 'join', room: result.data.room, name: result.data.name } };
    case 'chat': return { ok: true, value: { type: 'chat', text: result.data.text } };
    case 'input': return { ok: true, value: { type: 'input', seq: result.data.seq, tick: result.data.tick, thrust: result.data.thrust, turn: result.data.turn, fire: result.data.fire } };
    case 'leave': return { ok: true, value: { type: 'leave' } };
    default: { const impossible: never = result.data; return impossible; }
  }
}
export const validateMessage = parseClientMessage;


// Incoming server packets are untrusted too, even when they originate from our own server.
const serverJoined = z.object({v:version,type:z.literal('joined'),room:z.string(),name:z.string(),id:z.number().int().nonnegative()});
const serverRoster = z.object({v:version,type:z.literal('roster'),players:z.array(z.string())});
const serverChat = z.object({v:version,type:z.literal('chat'),name:z.string(),text:z.string(),at:z.number().optional()});
const serverSystem = z.object({v:version,type:z.literal('system'),text:z.string()});
const serverError = z.object({v:version,type:z.literal('error'),message:z.string()});
const snapshotObject = z.object({tick:z.number().int().nonnegative(),ships:z.array(z.object({kind:z.literal('ship').optional(),id:z.number(),x:z.number(),y:z.number(),vx:z.number(),vy:z.number(),angle:z.number(),hp:z.number(),score:z.number(),lastAckSeq:z.number().optional(),name:z.string().optional()})),bullets:z.array(z.object({kind:z.literal('bullet').optional(),id:z.number(),owner:z.number(),x:z.number(),y:z.number(),vx:z.number(),vy:z.number()})),asteroids:z.array(z.object({kind:z.literal('asteroid').optional(),id:z.number(),x:z.number(),y:z.number(),vx:z.number(),vy:z.number(),radius:z.number()})).optional()});
const serverSnapshot = z.object({v:version,type:z.literal('snapshot'),snapshot:snapshotObject});
export const ServerMessageSchema = z.discriminatedUnion('type',[serverJoined,serverRoster,serverChat,serverSystem,serverError,serverSnapshot]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;
export function parseServerMessage(value: unknown): ServerMessage | null {
  const result = ServerMessageSchema.safeParse(value);
  return result.success ? result.data : null;
}
