import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';
import assert from 'node:assert/strict';
import WebSocket from 'ws';

const port = 34000 + Math.floor(Math.random() * 1000);
const base = `http://127.0.0.1:${port}`;
const origin = 'http://localhost:3000';
const child = spawn(process.execPath, ['dist/server/src/index.js'], {
  cwd: process.cwd(), env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', ALLOWED_ORIGINS: origin, LOG_DIR: `./logs/lab08-check-${port}` },
  stdio: ['ignore','pipe','pipe'],
});
let output = '';
child.stdout.on('data', chunk => { output += String(chunk); });
child.stderr.on('data', chunk => { output += String(chunk); });
const connections = new Set();
function openSocket(requestOrigin=origin) {
  return new Promise((resolve,reject)=>{
    const ws = new WebSocket(base.replace('http','ws')+'/ws', { headers: { Origin: requestOrigin } });
    ws.once('open', ()=>{ connections.add(ws); resolve(ws); });
    ws.once('error',reject);
    ws.once('unexpected-response',(_,response)=>reject(new Error(`HTTP ${response.statusCode}`)));
  });
}
function waitMessage(ws, predicate, ms=3000) {
  return new Promise((resolve,reject)=>{
    const timeout = setTimeout(()=>{ cleanup(); reject(new Error('Timed out waiting for WebSocket event')); },ms);
    function message(raw,isBinary) {
      if(isBinary) return;
      try { const obj=JSON.parse(raw.toString()); if(predicate(obj)) {cleanup();resolve(obj);} } catch { /* ignore */ }
    }
    function cleanup() {clearTimeout(timeout);ws.off('message',message);}
    ws.on('message', message);
  });
}
async function waitReady(){ for(let i=0;i<80;i++){if(child.exitCode!==null) throw new Error(`Server exited: ${output}`);try { const r=await fetch(base+'/ready'); if(r.ok)return; }catch{ /* keep polling until server is ready */ } await sleep(100);} throw new Error(`Server never became ready: ${output}`); }
try {
  await waitReady();
  const health = await (await fetch(base+'/health')).json();
  assert.equal(health.ok,true);
  assert.ok(typeof health.sha==='string');
  assert.equal((await fetch(base+'/ready')).status,200);
  assert.ok((await (await fetch(base+'/metrics')).text()).includes('dogfight_players'));

  // Invalid browser origin must fail during the HTTP upgrade handshake.
  const denied = await new Promise(resolve=>{
    const ws = new WebSocket(base.replace('http','ws')+'/ws',{headers:{Origin:'https://attacker.invalid'}});
    ws.once('unexpected-response',(_req,res)=>resolve(res.statusCode===403));
    ws.once('open',()=>{ws.terminate();resolve(false);});
    ws.once('error',()=>resolve(true));
  });
  assert.equal(denied,true,'Untrusted origin was accepted');

  const a = await openSocket(); const b = await openSocket(); const other = await openSocket();
  const joinedA = waitMessage(a,m=>m.type==='joined');
  const joinedB = waitMessage(b,m=>m.type==='joined');
  a.send(JSON.stringify({v:2,type:'join',room:'classic',name:'PlayerA'}));
  b.send(JSON.stringify({v:2,type:'join',room:'classic',name:'PlayerB'}));
  other.send(JSON.stringify({v:2,type:'join',room:'easy',name:'Isolated'}));
  await Promise.all([joinedA,joinedB]);
  const receivedChat = waitMessage(b,m=>m.type==='chat' && m.text==='Hello from CI');
  a.send(JSON.stringify({v:2,type:'chat',text:'Hello from CI'}));
  await receivedChat;

  // Flood invalid frames; client should be disconnected without crashing other rooms.
  const hostile = await openSocket();
  const closeHostile = once(hostile,'close');
  for(let i=0;i<1000;i++) { if(hostile.readyState!==WebSocket.OPEN) break; hostile.send('not-json'); }
  await Promise.race([closeHostile,sleep(3500).then(()=>{throw Error('Hostile client not disconnected');})]);
  assert.equal((await fetch(base+'/health')).status,200,'Bad client crashed server');
  assert.ok((await (await fetch(base+'/metrics')).text()).includes('dogfight_ws_rejected_total'));

  // Simulate a client disappearing without a leave message.
  other.terminate();
  await sleep(120);
  assert.equal((await fetch(base+'/ready')).status,200);
  if (process.platform !== 'win32') {
    const closes = [a,b].map(socket=>once(socket,'close'));
    const shut = [a,b].map(socket=>waitMessage(socket,m=>m.type==='shutdown'));
    child.kill('SIGTERM');
    await Promise.all(shut);
    const codes = await Promise.all(closes);
    assert.ok(codes.every(value=>value[0]===1001),'Expected shutdown close 1001');
    await Promise.race([once(child,'exit'),sleep(8000).then(()=>{throw Error('Shutdown timeout');})]);
    assert.equal(child.exitCode,0);
  } else {
    console.log('SIGTERM shutdown and close 1001 are tested via docker stop on Windows.');
  }
  console.log('PASS: HTTP health, ready, metrics; origin rejection; two clients and chat; malformed-frame isolation; disconnect' + (process.platform!=='win32'?'; graceful SIGTERM':''));
} catch (err) {
  console.error(err, output.slice(-3000));
  process.exitCode=1;
} finally {
  for (const ws of connections) ws.terminate();
  if(child.exitCode===null) child.kill();
}
