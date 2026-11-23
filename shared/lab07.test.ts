import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import { createShip, createAsteroids, integrateShip, stepWorld, seededRandom, asSeq, asTick, entityId, DT, WORLD_WIDTH, WORLD_HEIGHT } from './simulation.js';
import type { WorldState, Input } from './simulation.js';
import { encodeInput, decodeInput, encodeSnapshot, decodeSnapshot, PROTOCOL_VERSION } from './protocol.js';
import { parseClientMessage } from './schema.js';
import { Vector2 } from './vector2.js';
import { FrameStats } from './frame-stats.js';
import { ParticlePool } from './pool.js';
import { BulletPool } from './bullet-pool.js';
import { TokenBucket } from './rate-limit.js';
import { reconcileShip } from './reconcile.js';
const input = (seq=1, thrust=false, turn=0, fire=false): Input => ({seq:asSeq(seq), tick:asTick(seq),thrust,turn,fire});
const world = (): WorldState => ({tick:asTick(0),ships:[createShip(1,'A',1),createShip(2,'B',2,1)],bullets:[],asteroids:[],nextBulletId:1});
const valid = (seq=1) => ({v:PROTOCOL_VERSION,type:'input',seq,tick:0,thrust:true,turn:1,fire:false});

describe('vector and deterministic integration', () => {
  for (const [x,y] of [[0,0],[1,2],[-4,7],[300,-300],[-0.1,0.2]]) {
    it(`vector magnitude ${x},${y}`, () => {
      const v=new Vector2(x!,y!);expect(v.x).toBe(x);expect(v.y).toBe(y);
    });
  }
  for(const heading of [-1,0,1]) for(const thrust of [false,true]) for(const dt of [1/30,1/60,1/120]) {
    it(`integration deterministic turn=${heading} thrust=${thrust} dt=${dt}`,()=>{
      const a=createShip(1,'A',1), b=createShip(1,'A',1);
      integrateShip(a,input(1,thrust,heading),dt);integrateShip(b,input(1,thrust,heading),dt);
      expect(a).toEqual(b);
      expect(a.x).toBeGreaterThanOrEqual(0);expect(a.x).toBeLessThan(WORLD_WIDTH);
    });
  }
  it('thrust changes velocity',()=>{const s=createShip(1,'A',1);integrateShip(s,input(1,true));expect(Math.hypot(s.vx,s.vy)).toBeGreaterThan(0);});
  it('speed capped',()=>{const s=createShip(1,'A',1);s.vx=900;integrateShip(s,input());expect(Math.hypot(s.vx,s.vy)).toBeLessThanOrEqual(420.00001);});
  it('seed reproduces same random values',()=>{const a=seededRandom(123),b=seededRandom(123);expect(Array.from({length:100},()=>a())).toEqual(Array.from({length:100},()=>b()));});
  it('asteroid seed creates equal arrays',()=>expect(createAsteroids(8,123)).toEqual(createAsteroids(8,123)));
  it('asteroid count clamped to 30',()=>expect(createAsteroids(999)).toHaveLength(30));
  it('step preserves identical deterministic worlds',()=>{const a=world(),b=world();for(let i=0;i<30;i++){stepWorld(a,new Map([[1,input(i+1,true,1,true)]]));stepWorld(b,new Map([[1,input(i+1,true,1,true)]]));}expect(a).toEqual(b);});
  it('spawned bullet has owner and TTL',()=>{const w=world();stepWorld(w,new Map([[1,input(1,false,0,true)]]));expect(w.bullets[0]?.owner).toBe(1);expect(w.bullets[0]?.life).toBeGreaterThan(0);});
  it('expired bullet is removed',()=>{const w=world();w.bullets.push({kind:'bullet',id:entityId(1),owner:entityId(1),x:0,y:0,vx:0,vy:0,life:0});stepWorld(w,new Map());expect(w.bullets).toHaveLength(0);});
  it('bullet destroys asteroid on overlap',()=>{const w=world();w.ships=[];w.asteroids=[{kind:'asteroid',id:entityId(1),x:100,y:100,vx:0,vy:0,radius:20}];w.bullets=[{kind:'bullet',id:entityId(1),owner:entityId(1),x:100,y:100,vx:0,vy:0,life:1}];stepWorld(w,new Map());expect(w.asteroids).toHaveLength(0);});
  it('distant bullet misses asteroid',()=>{const w=world();w.ships=[];w.asteroids=[{kind:'asteroid',id:entityId(1),x:100,y:100,vx:0,vy:0,radius:20}];w.bullets=[{kind:'bullet',id:entityId(1),owner:entityId(1),x:500,y:500,vx:0,vy:0,life:1}];stepWorld(w,new Map());expect(w.asteroids).toHaveLength(1);});
});

describe('codec and validation',()=>{
  for (const turn of [-1,0,1]) for(const thrust of [false,true]) for(const fire of [false,true]) {
    it(`binary input roundtrip ${turn}/${thrust}/${fire}`,()=>{
      const packet=input(1,thrust,turn,fire);expect(decodeInput(encodeInput({...packet,tick:asTick(1)}))).toEqual(packet);
    });
  }
  it('input length always 12 bytes',()=>expect(encodeInput({...input(),tick:asTick(1)}).byteLength).toBe(12));
  it('snapshot packet size includes 11 byte header',()=>{const w=world();const bytes=encodeSnapshot(w);expect(bytes.byteLength).toBe(11+2*28);});
  it('asteroids survive snapshot',()=>{const w=world();w.asteroids=createAsteroids(3);expect(decodeSnapshot(encodeSnapshot(w)).asteroids).toHaveLength(3);});
  it('rejects wrong protocol version',()=>{const buf=encodeInput({...input(),tick:asTick(1)});new DataView(buf).setUint8(0,255);expect(()=>decodeInput(buf)).toThrow();});
  it('rejects invalid packet length',()=>expect(()=>decodeInput(new ArrayBuffer(5))).toThrow());
  it('rejects malformed snapshot',()=>expect(()=>decodeSnapshot(new ArrayBuffer(2))).toThrow());
  it('valid join parses',()=>expect(parseClientMessage({v:PROTOCOL_VERSION,type:'join',room:'classic',name:'A'}).ok).toBe(true));
  it('invalid JSON data never throws',()=>expect(parseClientMessage(null).ok).toBe(false));
  it('invalid turn rejected',()=>expect(parseClientMessage({...valid(),turn:999}).ok).toBe(false));
  it('unknown type rejected',()=>expect(parseClientMessage({...valid(),type:'hack'}).ok).toBe(false));
});

describe('prediction, timing and pooling',()=>{
  it('reconcile discards acknowledged input',()=>{const s=createShip(1,'A',1);const out=reconcileShip(s,[input(1,true),input(2,true)],asSeq(1));expect(out.pending).toHaveLength(1);expect(out.ship.x!==s.x||out.ship.y!==s.y).toBe(true);});
  it('reconcile without pending keeps snapshot',()=>{const s=createShip(1,'A',1);expect(reconcileShip(s,[],asSeq(0)).ship).toEqual(s);});
  it('token bucket blocks excess',()=>{const b=new TokenBucket(10,2);expect(b.take(0)).toBe(true);expect(b.take(0)).toBe(true);expect(b.take(0)).toBe(false);});
  it('token bucket refills over time',()=>{const b=new TokenBucket(10,1);b.take(0);expect(b.take(100)).toBe(true);});
  it('token bucket rejects backwards time',()=>{const b=new TokenBucket(10,1,100);expect(b.take(10)).toBe(false);});
  it('particle pool reuses same object',()=>{const pool=new ParticlePool(1);const a=pool.spawn(1,2,0,0,1);pool.update(2);const b=pool.spawn(3,4,0,0,1);expect(a).toBe(b);});
  it('bullet pool reuses expired object',()=>{const pool=new BulletPool(1);const w=world();w.bulletPool=pool;w.bullets=[pool.acquire({kind:'bullet',id:entityId(1),owner:entityId(1),x:1,y:1,vx:0,vy:0,life:0})];const previous=w.bullets[0];stepWorld(w,new Map());expect(pool.activeCount()).toBe(0);expect(pool.acquire({kind:'bullet',id:entityId(2),owner:entityId(1),x:2,y:2,vx:0,vy:0,life:1})).toBe(previous);});
  it('particle pool caps at capacity',()=>{const pool=new ParticlePool(1);pool.spawn(0,0,0,0,1);expect(pool.spawn(0,0,0,0,1)).toBeNull();});
  it('frame stats computes percentiles',()=>{const s=new FrameStats(10);[1,2,3,4,5].forEach(v=>s.add(v));expect(s.summary()).toMatchObject({count:5,p50:3,p95:5,p99:5});});
  it('fake timer controlled refill',()=>{vi.useFakeTimers();try{vi.setSystemTime(0);const b=new TokenBucket(1,1,Date.now());b.take(Date.now());vi.advanceTimersByTime(1000);expect(b.take(Date.now())).toBe(true);}finally{vi.useRealTimers();}});
});

describe('fast-check properties',()=>{
  it('input roundtrip for arbitrary seq and flags',()=>fc.assert(fc.property(fc.integer({min:1,max:2**32-1}),fc.boolean(),fc.boolean(),fc.integer({min:-1,max:1}),(seq:number,t:boolean,f:boolean,turn:number)=>{const m={...input(seq,t,turn,f),tick:asTick(seq)};expect(decodeInput(encodeInput(m))).toEqual(m);} ),{numRuns:120}));
  it('binary lengths match encoded entity counts',()=>fc.assert(fc.property(fc.integer({min:0,max:10}),fc.integer({min:0,max:10}),(ships:number,asteroids:number)=>{const w=world();w.ships=Array.from({length:ships},(_,i)=>createShip(i+1,'B',1));w.asteroids=createAsteroids(asteroids);const encoded=encodeSnapshot(w);expect(encoded.byteLength).toBe(11+ships*28+asteroids*24);} ),{numRuns:100}));
  it('bad length buffers always produce an error',()=>fc.assert(fc.property(fc.integer({min:0,max:11}),(len:number)=>{expect(()=>decodeInput(new ArrayBuffer(len))).toThrow();}),{numRuns:50}));
  it('ships stay inside arena under arbitrary controls',()=>fc.assert(fc.property(fc.array(fc.tuple(fc.boolean(),fc.integer({min:-1,max:1})),{minLength:1,maxLength:200}),(commands:Array<[boolean,number]>)=>{const s=createShip(1,'A',1);for(const [thrust,turn] of commands)integrateShip(s,input(1,thrust,turn));expect(s.x).toBeGreaterThanOrEqual(0);expect(s.x).toBeLessThan(WORLD_WIDTH);expect(s.y).toBeGreaterThanOrEqual(0);expect(s.y).toBeLessThan(WORLD_HEIGHT);}),{numRuns:80}));
  it('snapshot roundtrip stays within Float32 and angle tolerance',()=>fc.assert(fc.property(fc.double({min:-3,max:3,noNaN:true}), (angle:number)=>{const w=world();w.ships[0]!.angle=angle;const decoded=decodeSnapshot(encodeSnapshot(w));expect(Math.abs((decoded.ships[0]?.angle??0)-angle)).toBeLessThan(.00011);}),{numRuns:100}));
  it('parser accepts valid messages and rejects a damaged turn',()=>fc.assert(fc.property(fc.integer({min:1,max:100000}),(seq:number)=>{expect(parseClientMessage(valid(seq)).ok).toBe(true);expect(parseClientMessage({...valid(seq),turn:100}).ok).toBe(false);}),{numRuns:100}));
});


describe('additional edge cases for shared modules',()=>{
  it('vector add',()=>{const v=new Vector2(2,3).add(new Vector2(4,5));expect([v.x,v.y]).toEqual([6,8]);});
  it('vector sub',()=>{const v=new Vector2(2,3).sub(new Vector2(4,5));expect([v.x,v.y]).toEqual([-2,-2]);});
  it('vector scale',()=>{const v=new Vector2(2,3).scale(4);expect([v.x,v.y]).toEqual([8,12]);});
  it('vector length',()=>expect(new Vector2(3,4).length()).toBe(5));
  it('vector normalization',()=>expect(new Vector2(3,0).normalize().x).toBe(1));
  it('zero normalization is stable',()=>expect(new Vector2(0,0).normalize()).toEqual(new Vector2(0,0)));
  it('rejects invalid entity id',()=>expect(()=>entityId(-1)).toThrow());
  it('rejects invalid tick',()=>expect(()=>asTick(-1)).toThrow());
  it('rejects invalid seq',()=>expect(()=>asSeq(-1)).toThrow());
  it('rejects NaN input value',()=>expect(()=>encodeInput({...input(),tick:asTick(0),turn:NaN})).toThrow());
  it('rejects zero sequence',()=>expect(()=>encodeInput({...input(),tick:asTick(0),seq:asSeq(0)})).toThrow());
  it('rejects bad input flags',()=>{const b=encodeInput({...input(),tick:asTick(0)});new DataView(b).setUint8(10,255);expect(()=>decodeInput(b)).toThrow();});
  it('rejects invalid input turn',()=>{const b=encodeInput({...input(),tick:asTick(0)});new DataView(b).setInt8(11,3);expect(()=>decodeInput(b)).toThrow();});
  it('snapshot bullet roundtrip',()=>{const w=world();w.bullets=[{kind:'bullet',id:entityId(1),owner:entityId(1),x:10,y:20,vx:30,vy:40,life:1}];const result=decodeSnapshot(encodeSnapshot(w));expect(result.bullets[0]?.vx).toBe(30);});
  it('rejects corrupted snapshot length',()=>{const b=encodeSnapshot(world());expect(()=>decodeSnapshot(b.slice(0,b.byteLength-1))).toThrow();});
  it('rejects corrupted ship health',()=>{const b=encodeSnapshot(world());new DataView(b).setUint8(11+4+16+2,255);expect(()=>decodeSnapshot(b)).toThrow();});
  it('rejects corrupted asteroid radius',()=>{const w=world();w.asteroids=createAsteroids(1);const b=encodeSnapshot(w);const pos=11+2*28+4+4*4;new DataView(b).setFloat32(pos,-1,true);expect(()=>decodeSnapshot(b)).toThrow();});
  it('rejects non-finite ship',()=>{const b=encodeSnapshot(world());new DataView(b).setFloat32(15,NaN,true);expect(()=>decodeSnapshot(b)).toThrow();});
  it('ship bullet collision lowers health',()=>{const w=world();w.bullets=[{kind:'bullet',id:entityId(1),owner:entityId(1),x:w.ships[1]!.x,y:w.ships[1]!.y,vx:0,vy:0,life:1}];stepWorld(w,new Map());expect(w.ships[1]!.hp).toBe(2);});
  it('ship asteroid collision removes asteroid',()=>{const w=world();w.asteroids=[{kind:'asteroid',id:entityId(8),x:w.ships[0]!.x,y:w.ships[0]!.y,vx:0,vy:0,radius:22}];stepWorld(w,new Map());expect(w.asteroids).toHaveLength(0);});
  it('token bucket validates capacity',()=>expect(()=>new TokenBucket(0,2)).toThrow());
  it('token bucket rejects NaN time',()=>expect(new TokenBucket(1,1).take(NaN)).toBe(false));
  it('particle pool rejects non-positive capacity',()=>expect(()=>new ParticlePool(0)).toThrow());
  it('frame stats rejects invalid capacity',()=>expect(()=>new FrameStats(0)).toThrow());
  it('frame stats ignores invalid duration',()=>{const s=new FrameStats(3);s.add(-1);s.add(NaN);expect(s.summary().count).toBe(0);});
  it('frame stats rings when full',()=>{const s=new FrameStats(2);s.add(1);s.add(2);s.add(3);expect(s.summary().p50).toBe(2);});
  it('pool update deactivates expired particle',()=>{const p=new ParticlePool(1);p.spawn(0,0,1,0,1);p.update(2);expect(p.activeCount()).toBe(0);});
  it('parse valid chat',()=>expect(parseClientMessage({v:PROTOCOL_VERSION,type:'chat',text:'hello'}).ok).toBe(true));
  it('parse valid leave',()=>expect(parseClientMessage({v:PROTOCOL_VERSION,type:'leave'}).ok).toBe(true));
  it('parse bad room',()=>expect(parseClientMessage({v:PROTOCOL_VERSION,type:'join',room:'../secret',name:'A'}).ok).toBe(false));
});
