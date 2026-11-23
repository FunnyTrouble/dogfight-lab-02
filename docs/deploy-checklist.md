# Lab 08 — production verification

Local Windows: `powershell -ExecutionPolicy Bypass -File scripts/check-lab08.ps1`.
With Docker installed: `docker compose up -d --build`, `docker images dogfight:lab-08`, `docker compose exec game id`, `node scripts/verify-production.mjs`, `docker compose stop -t 10`. Record whether image is under 200 MB and whether SIGTERM finishes in less than 10 seconds.

For a public address: deploy a **single** Docker instance behind an HTTPS reverse proxy with WebSocket Upgrade support. Set `ALLOWED_ORIGINS=https://your-actual-domain`. Set `GIT_SHA` to the commit being deployed; `/health` displays it. HTTPS pages use `wss://` automatically. After deployment, test from two independent networks and record RTT from each player.

Do not publish a live address, metrics, RTT, GC pause values, or a profile screenshot unless actually measured.

For the dedicated load test only, start a disposable server with `MAX_CONNECTIONS_PER_IP=128` (not the public production limit) and run `npm run bench:load`. The load tester sends `TEST_ORIGIN=http://localhost:3000` by default. Record rates and tick durations before publishing a capacity claim.
