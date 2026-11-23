import { performance } from 'node:perf_hooks';
import { createShip, createAsteroids, stepWorld, asTick, asSeq, DT } from '../shared/simulation.js';
import type { Input, WorldState } from '../shared/simulation.js';
import { writeFileSync, mkdirSync } from 'node:fs';
const samples: number[]=[];
const w: WorldState = {tick:asTick(0),ships:Array.from({length:8},(_,i)=>createShip(i+1,`Bot${i}`,i,i)),bullets:[],asteroids:createAsteroids(8,42),nextBulletId:1};
const inputs = new Map<number,Input>();
for (let i=0;i<8;i++)inputs.set(i+1,{seq:asSeq(1),thrust:true,turn:i%3-1,fire:true});
// Warmup so JIT is not counted as steady-state.
for(let i=0;i<200;i++)stepWorld(w,inputs,DT);
for(let i=0;i<900;i++){const t=performance.now();stepWorld(w,inputs,DT);samples.push(performance.now()-t);}
samples.sort((a,b)=>a-b);
const percentile=(p:number)=>samples[Math.ceil(samples.length*p)-1] ?? 0;
const result={environment:process.version, durationTicks:900, bots:8, tickMs:{p50:percentile(.5),p95:percentile(.95),p99:percentile(.99)}, rssBytes:process.memoryUsage().rss};
mkdirSync('docs', {recursive:true});
writeFileSync('docs/simulation-benchmark.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
