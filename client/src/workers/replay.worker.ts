// Self-contained worker experiment: checksum replay bytes off the render thread.
self.onmessage = (event: MessageEvent<ArrayBuffer>) => {
  const bytes = new Uint8Array(event.data);
  let checksum=0;
  for (const byte of bytes) checksum = (Math.imul(checksum,31)+byte) >>> 0;
  self.postMessage({checksum,bytes:bytes.byteLength});
};
