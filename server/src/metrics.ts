import { performance } from 'node:perf_hooks';
import type { RoomManager } from './rooms.js';
let previousSample = {at: performance.now(), inMessages:0, outMessages:0, inBytes:0, outBytes:0};
let measuredRates = {messagesInPerSec:0,messagesOutPerSec:0,bytesInPerSec:0,bytesOutPerSec:0};
export const traffic = { inMessages: 0, outMessages: 0, inBytes: 0, outBytes: 0, rejected: new Map<string,number>() };
export function rejectMetric(reason: string): void { traffic.rejected.set(reason, (traffic.rejected.get(reason) ?? 0) + 1); }
export function getMetrics(rooms: RoomManager): Record<string,unknown> {
  const now = performance.now();
  const duration = (now-previousSample.at)/1000;
  if (duration >= 1) {
    measuredRates = {
      messagesInPerSec: (traffic.inMessages-previousSample.inMessages)/duration,
      messagesOutPerSec: (traffic.outMessages-previousSample.outMessages)/duration,
      bytesInPerSec: (traffic.inBytes-previousSample.inBytes)/duration,
      bytesOutPerSec: (traffic.outBytes-previousSample.outBytes)/duration,
    };
    previousSample = {at:now,inMessages:traffic.inMessages,outMessages:traffic.outMessages,inBytes:traffic.inBytes,outBytes:traffic.outBytes};
  }
  const utilization = performance.eventLoopUtilization();
  return { players: [...rooms.rooms.values()].reduce((s,r)=>s+r.players.size,0),
    rooms: rooms.rooms.size, inMessages: traffic.inMessages, outMessages: traffic.outMessages,
    inBytes: traffic.inBytes, outBytes: traffic.outBytes, ...measuredRates,
    rejected: Object.fromEntries(traffic.rejected),
    tickP99Ms: Math.max(0,...[...rooms.rooms.values()].map(r=>r.tickP99())),
    eventLoopUtilization: utilization.utilization, rssBytes: process.memoryUsage().rss,
    heapUsedBytes: process.memoryUsage().heapUsed, uptimeSeconds: process.uptime() };
}
export function metricsText(rooms: RoomManager): string {
  const m = getMetrics(rooms);
  const keys = ['players','rooms','inMessages','outMessages','inBytes','outBytes','tickP99Ms','eventLoopUtilization','rssBytes','heapUsedBytes','uptimeSeconds','messagesInPerSec','messagesOutPerSec','bytesInPerSec','bytesOutPerSec'];
  const names = ['dogfight_players','dogfight_rooms','dogfight_ws_messages_in_total','dogfight_ws_messages_out_total','dogfight_ws_bytes_in_total','dogfight_ws_bytes_out_total','dogfight_tick_p99_ms','dogfight_event_loop_utilization','dogfight_rss_bytes','dogfight_heap_used_bytes','dogfight_uptime_seconds','dogfight_ws_messages_in_per_second','dogfight_ws_messages_out_per_second','dogfight_ws_bytes_in_per_second','dogfight_ws_bytes_out_per_second'];
  return keys.map((k,i)=>`${names[i]} ${Number(m[k] ?? 0)}`).join('\n')+'\n'+[...traffic.rejected].map(([reason,count])=>`dogfight_ws_rejected_total{reason="${reason.replace(/[^a-z_]/gi,'_')}"} ${count}`).join('\n')+'\n';
}
