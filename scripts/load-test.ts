import WebSocket from 'ws';
import { performance } from 'node:perf_hooks';
const host=process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const sizes=[8,32,64,128];
const results: Array<{clients:number;connected:number;errors:number;elapsedMs:number;tickP99:number|null}> = [];
for (const size of sizes) {
  const rooms=Math.ceil(size/12); const names:string[]=[];
  for(let r=0;r<rooms;r++){
    const id=`load-${size}-${r}`;const response=await fetch(`${host}/api/rooms`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id,name:id,asteroids:1})});
    if(!response.ok)throw new Error(`Cannot create room ${id}: ${response.status}`);
    names.push(id);
  }
  const sockets: WebSocket[]=[];let connected=0,errors=0;const start=performance.now();
  await Promise.all(Array.from({length:size},(_,i)=>new Promise<void>(resolve=>{
    const room=names[Math.floor(i/12)] ?? names[0]!;
    const socket=new WebSocket(host.replace(/^http/,'ws')+'/ws',{headers:{Origin:process.env.TEST_ORIGIN ?? 'http://localhost:3000'}});sockets.push(socket);
    const finish=()=>resolve();
    socket.once('open',()=>{connected++;socket.send(JSON.stringify({v:2,type:'join',room,name:`Load${i}`}));finish();});
    socket.once('error',()=>{errors++;finish();});
    setTimeout(finish,3000);
  })));
  await new Promise(resolve=>setTimeout(resolve,1000));
  let tickP99:null|number=null;
  try { const data=await (await fetch(`${host}/api/stats`)).json() as {rooms:Array<{id:string;tickP99:number}>};tickP99=Math.max(...data.rooms.filter(r=>names.includes(r.id)).map(r=>r.tickP99)); }catch{errors++;}
  results.push({clients:size,connected,errors,elapsedMs:Math.round(performance.now()-start),tickP99});
  for(const socket of sockets)socket.close();
  await new Promise(resolve=>setTimeout(resolve,150));
}
console.table(results);
console.log('Capacity criterion: first number with tickP99 > 33 ms; also inspect errors and connection limits.');
