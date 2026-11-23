import {describe,it,expect} from 'vitest';
import {packet,parseClientMessage} from '../src/protocol.js';
import {ServerConfigSchema} from '../src/config.js';
import {PROTOCOL_VERSION} from '../../shared/protocol.js';
describe('server validation',()=>{
  it('packet version matches shared schema',()=>{expect(JSON.parse(packet('leave')).v).toBe(PROTOCOL_VERSION);});
  it('rejects unknown message',()=>{expect(parseClientMessage({v:PROTOCOL_VERSION,type:'bad'}).ok).toBe(false);});
  it('config has positive default port',()=>expect(ServerConfigSchema.parse({}).PORT).toBeGreaterThan(0));
});
