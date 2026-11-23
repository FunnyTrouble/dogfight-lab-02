/** Compare replay checksum work on main thread versus a Worker + transferred buffer. */
export async function benchmarkReplayWorker(size=1024*1024): Promise<{mainMs:number;workerMs:number;recommendation:string}> {
  const payload=new Uint8Array(size);
  for(let i=0;i<size;i++)payload[i]=i%251;
  const begin=performance.now();
  let checksum=0;
  for(const byte of payload)checksum=(Math.imul(checksum,31)+byte)>>>0;
  const mainMs=performance.now()-begin;
  const worker=new Worker(new URL('./workers/replay.worker.ts',import.meta.url),{type:'module'});
  const workerStart=performance.now();
  const completed=new Promise<number>((resolve,reject)=>{
    worker.onerror=()=>reject(new Error('Worker error'));
    worker.onmessage=(event:MessageEvent<{checksum:number}>)=>resolve(event.data.checksum);
  });
  worker.postMessage(payload.buffer,[payload.buffer]);
  try {const result=await completed; if(result!==checksum)throw new Error('Checksum mismatch');}
  finally {worker.terminate();}
  const workerMs=performance.now()-workerStart;
  return {mainMs,workerMs,recommendation:workerMs<mainMs?'worker faster':'keep main-thread version for this workload'};
}
