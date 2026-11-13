import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { resolve } from "node:path";

const totalBytes = 200 * 1024 * 1024;
const chunkSize = 64 * 1024;
const samples = [];
const start = Date.now();
let sent = 0;

async function* chunks() {
  while (sent < totalBytes) {
    const size = Math.min(chunkSize, totalBytes - sent);
    sent += size;
    yield Buffer.alloc(size, 120);
  }
}

const throttle = new Transform({
  transform(chunk, _encoding, callback) {
    setTimeout(() => callback(null, chunk), 1);
  },
});
const sampleTimer = setInterval(() => {
  samples.push({
    seconds: Number(((Date.now() - start) / 1000).toFixed(2)),
    rssMiB: Number((process.memoryUsage().rss / 1024 / 1024).toFixed(1)),
  });
}, 100);
sampleTimer.unref();

const outDir = resolve("server/logs");
await mkdir(outDir, { recursive: true });
await pipeline(
  Readable.from(chunks()),
  throttle,
  createWriteStream(resolve(outDir, "synthetic-200mb.bin")),
);
clearInterval(sampleTimer);
samples.push({
  seconds: Number(((Date.now() - start) / 1000).toFixed(2)),
  rssMiB: Number((process.memoryUsage().rss / 1024 / 1024).toFixed(1)),
});
await writeFile(
  resolve(outDir, "rss-samples.csv"),
  `seconds,rssMiB\n${samples.map((row) => `${row.seconds},${row.rssMiB}`).join("\n")}\n`,
);
console.log(
  `Streamed ${(totalBytes / 1024 / 1024).toFixed(0)} MiB with pipeline in ${samples.at(-1).seconds}s.`,
);
console.log(
  `RSS range: ${Math.min(...samples.map((x) => x.rssMiB))}–${Math.max(...samples.map((x) => x.rssMiB))} MiB`,
);
console.log(`Samples saved to ${resolve(outDir, "rss-samples.csv")}`);
