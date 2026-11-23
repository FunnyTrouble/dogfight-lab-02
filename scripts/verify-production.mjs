import assert from 'node:assert/strict';
import WebSocket from 'ws';
const origin = process.env.TEST_ORIGIN || 'http://localhost:3000';
const base = process.env.TEST_BASE || 'http://127.0.0.1:3000';
for (const path of ['/health','/ready','/metrics']) { const result=await fetch(base+path); assert.equal(result.status,200,`${path} must respond 200`); console.log(path, (await result.text()).slice(0,250)); }
const ws = new WebSocket(base.replace('http','ws')+'/ws',{headers:{Origin:origin}});
await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject)});
ws.close();
const invalid = new WebSocket(base.replace('http','ws')+'/ws',{headers:{Origin:'https://evil.example'}});
await new Promise((resolve,reject)=>{invalid.once('unexpected-response',(_req,res)=>{if(res.statusCode===403)resolve();else reject(new Error(`Expected 403, got ${res.statusCode}`))});invalid.once('open',()=>reject(new Error('Invalid origin accepted')));invalid.once('error',reject)});
console.log('Production HTTP, allowed and rejected origins verified');
