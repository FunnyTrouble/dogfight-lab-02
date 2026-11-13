import { spawn } from "node:child_process";

const commands = [
  spawn("npm run dev --workspace client", { shell: true, stdio: "inherit" }),
  spawn("npm run dev --workspace server", { shell: true, stdio: "inherit" }),
];
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of commands) child.kill("SIGTERM");
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const child of commands) child.on("exit", (code) => { if (!stopping && code !== 0) { stop(); process.exitCode = code || 1; } });
