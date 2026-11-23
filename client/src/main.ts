import { z } from 'zod';
import type { Snapshot, DecodedInput } from '../../shared/protocol.js';
import type { Ship, SnapshotShip, SnapshotBullet, Asteroid } from '../../shared/simulation.js';
import type { Progress, AssetDescription } from './assets/loader.js';
import type { LobbyRoom } from './lobby.js';
const ManifestSchema = z.record(z.string(),z.object({type:z.enum(['image','json','audio']),url:z.string()}));
interface PredictBullet {id:number;owner:number;x:number;y:number;vx:number;vy:number;born:number}
interface TimedSnapshot extends Snapshot {receivedAt:number;bytes:number;time:number}
function messageOf(error: unknown): string {return error instanceof Error ? error.message : String(error)}
import { createShip, integrateShip, DT, entityId, asTick, asSeq } from "../../shared/simulation.js";
import "./style.css";
import { createInput } from "./input.js";
import { setupCanvas } from "./render/canvas.js";
import { drawBackground } from "./render/draw.js";
import { loadJson, loadAll } from "./assets/loader.js";
import { Lobby } from "./lobby.js";
import { GameAudio } from "./audio.js";
import { GameConnection } from "./connection.js";
import { Bus } from "../../shared/events.js";
import { FrameStats } from "../../shared/frame-stats.js";
import { reconcileShip } from "../../shared/reconcile.js";
import { benchmarkReplayWorker } from "./worker-experiment.js";
import type { GameEvents } from "../../shared/events.js";
const gameplayEvents = new Bus<GameEvents>();
const frameStats = new FrameStats(1800);
// DevTools: run `window.dogfightFrameStats()` after 30 seconds to read p50/p95/p99.
Object.assign(window, { dogfightFrameStats: () => frameStats.summary(), dogfightWorkerExperiment: benchmarkReplayWorker });

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const lobbyElement = document.querySelector<HTMLElement>("#lobby")!;
const lobbyForm = document.querySelector<HTMLFormElement>("#lobby-form")!;
const playerNameInput = document.querySelector<HTMLInputElement>("#player-name")!;
const roomSelect = document.querySelector<HTMLSelectElement>("#room-select")!;
const lobbyStatus = document.querySelector<HTMLElement>("#lobby-status")!;
const joinButton = document.querySelector<HTMLButtonElement>("#join-button")!;
const chatPanel = document.querySelector<HTMLElement>("#chat-panel")!;
const connectionStatus = document.querySelector<HTMLElement>("#connection-status")!;
const roomRoster = document.querySelector<HTMLElement>("#room-roster")!;
const chatMessages = document.querySelector<HTMLUListElement>("#chat-messages")!;
const chatForm = document.querySelector<HTMLFormElement>("#chat-form")!;
const chatText = document.querySelector<HTMLInputElement>("#chat-text")!;
const leaveButton = document.querySelector<HTMLButtonElement>("#leave-room")!;
let connection: GameConnection | null = null;
const view = setupCanvas(canvas);
const audioContext = new AudioContext();
const lobby = new Lobby({ statusElement: lobbyStatus, roomSelect, joinButton });
let loadedAssets: Record<string, unknown> | null = null;
let gameStarted = false;
let deploymentSha = 'local';
fetch('/health').then(r=>r.ok?r.json():null).then((data:unknown)=>{ if (data && typeof data === 'object' && 'sha' in data && typeof data.sha === 'string') deploymentSha=data.sha.slice(0,8); }).catch(()=>{});
let retryButton: HTMLButtonElement | null = null;

function drawLoadingProgress(progress: Progress) {
  const { ctx, width, height } = view;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#080d18";
  ctx.fillRect(0, 0, width, height);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#e9eef7";
  ctx.font = "bold 26px system-ui";
  ctx.fillText("DOGFIGHT — LAB 07", width / 2, height / 2 - 55);
  ctx.font = "16px system-ui";
  ctx.fillStyle = "#9aa7ba";
  ctx.fillText("Завантаження ресурсів...", width / 2, height / 2 - 15);
  const barWidth = Math.min(360, width - 40);
  const barHeight = 16;
  const barX = (width - barWidth) / 2;
  const barY = height / 2 + 15;
  ctx.fillStyle = "#263449";
  ctx.fillRect(barX, barY, barWidth, barHeight);
  ctx.fillStyle = "#67e8f9";
  ctx.fillRect(barX, barY, barWidth * progress.ratio, barHeight);
  ctx.strokeStyle = "#64748b";
  ctx.strokeRect(barX, barY, barWidth, barHeight);
  ctx.fillStyle = "#e9eef7";
  ctx.font = "14px system-ui";
  ctx.fillText(`${progress.completed} / ${progress.total} ресурсів (${Math.round(progress.ratio * 100)}%)`, width / 2, barY + 38);
}

function showLoadingError(errors: Array<{name: string; error: unknown}>, retry: () => Promise<void>) {
  const { ctx, width, height } = view;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#080d18";
  ctx.fillRect(0, 0, width, height);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fca5a5";
  ctx.font = "bold 20px system-ui";
  ctx.fillText("Не вдалося завантажити ресурси", width / 2, height / 2 - 45);
  ctx.fillStyle = "#e9eef7";
  ctx.font = "14px system-ui";
  ctx.fillText(errors.map((item) => `${item.name}: ${messageOf(item.error)}`).join("; ").slice(0, 120), width / 2, height / 2 - 12);
  retryButton?.remove();
  retryButton = document.createElement("button");
  retryButton.textContent = "Повторити завантаження";
  retryButton.style.cssText = "display:block;margin:12px auto;padding:10px 18px;cursor:pointer";
  retryButton.addEventListener("click", async () => {
    if (retryButton) {retryButton.disabled = true; retryButton.textContent = "Завантаження...";}
    await retry();
  }, { once: true });
  canvas.insertAdjacentElement("afterend", retryButton);
}

async function loadResources() {
  try {
    const manifest = ManifestSchema.parse(await loadJson("/assets/manifest.json", AbortSignal.timeout(8000)));
    const result = await loadAll(manifest, { onProgress: drawLoadingProgress, audioContext });
    if (!result.success) {
      showLoadingError(result.errors, boot);
      return null;
    }
    retryButton?.remove();
    retryButton = null;
    return result.assets;
  } catch (error) {
    showLoadingError([{ name: "manifest.json", error }], boot);
    return null;
  }
}

function addChatLine(text: string) {
  const item = document.createElement("li");
  item.textContent = text;
  chatMessages.append(item);
  while (chatMessages.children.length > 100) chatMessages.firstElementChild?.remove();
  chatMessages.scrollTop = chatMessages.scrollHeight;
}


chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = chatText.value.trim();
  if (!text || !connection) return;
  connection.send("chat", { text });
  chatText.value = "";
});

leaveButton.addEventListener("click", () => {
  connection?.close();
  window.location.reload();
});

function startNetworkGame(room: LobbyRoom, playerName: string, audio: GameAudio | null) {
  let state: Snapshot = { tick: asTick(0), ships: [], bullets: [], asteroids: [] };
  const predicted = createShip(0, playerName, 1, 0);
  const input = createInput(window);
  const naive = new URLSearchParams(location.search).get("naive") === "1";
  const drift = new URLSearchParams(location.search).get("drift") === "1";
  const pending: DecodedInput[] = [];
  const snapshots: TimedSnapshot[] = [];
  const predictedBullets: PredictBullet[] = [];
  let seq = 0; let localId: number | null = null; let lastSnapshotAt = performance.now();
  const sentAt = new Map<number, number>();
  let rtt = 0; let snapshotAge = 0; let bytesPerSecond = 0; let byteWindow = 0; let byteWindowAt = performance.now();
  let correctionX = 0; let correctionY = 0; let correctionAngle = 0; let correctionLeft = 0;
  const net = { rtt: 0, snapshotAge: 0, bytesPerSecond: 0, queue: 0, correction: 0, mode: new URLSearchParams(location.search).get('json') === '1' ? 'JSON comparison' : naive ? 'snapshot only' : drift ? 'drift experiment' : 'binary' };
  function readInput() {
    const turn = (input.isDown('KeyD') || input.isDown('ArrowRight') ? 1 : 0) - (input.isDown('KeyA') || input.isDown('ArrowLeft') ? 1 : 0);
    return { thrust: input.isDown('KeyW') || input.isDown('ArrowUp'), turn, fire: input.justPressed('Space') || input.justPressed('KeyF') };
  }
  function addLocalBullet(ship: Ship, tickSeq: number) {
    predictedBullets.push({ id: -tickSeq, owner: localId || 0, x: ship.x + Math.cos(ship.angle) * 20, y: ship.y + Math.sin(ship.angle) * 20, vx: ship.vx + Math.cos(ship.angle) * 360, vy: ship.vy + Math.sin(ship.angle) * 360, born: performance.now() });
  }
  connection?.close();
  connection = new GameConnection();
  chatPanel.hidden = false; chatMessages.replaceChildren();
  connectionStatus.textContent = 'Підключення до авторитетного сервера...';
  connection.onStatus((status) => {
    const labels: Record<string,string> = { connecting: 'Підключення...', connected: "З'єднання встановлено", disconnected: "З'єднання втрачено. Перепідключення...", error: 'Помилка WebSocket', 'invalid-message': 'Некоректний пакет', 'server-shutdown':'Сервер перезапускається. Повернення до лобі...'  };
    connectionStatus.textContent = labels[status] || status;
  });
  connection.onPacket((message) => {
    if (message.type === 'joined') { localId = message.id; predicted.id = entityId(message.id); connectionStatus.textContent = `Кімната ${message.room}: ${message.name}. Сервер рахує гру.`; }
    else if (message.type === 'roster') roomRoster.textContent = `Учасники (${message.players.length}): ${message.players.join(', ') || '—'}`;
    else if (message.type === 'chat') addChatLine(`${message.name}: ${message.text}`);
    else if (message.type === 'system') addChatLine(`• ${message.text}`);
    else if (message.type === 'error') addChatLine(`Помилка: ${message.message}`);
    else if (message.type === 'shutdown') { addChatLine('Сервер перезапускається. Повернення до лобі.'); setTimeout(()=>window.location.reload(),1200); }
  });
  connection.onSnapshot((snap) => { lastSnapshotAt = performance.now(); snapshotAge = 0;
    const ack = snap.ships.find((ship) => ship.id === localId)?.lastAckSeq;
    if (ack && sentAt.has(ack)) { rtt = performance.now() - (sentAt.get(ack) ?? performance.now()); for (const key of sentAt.keys()) if (key <= ack) sentAt.delete(key); }
    state = snap;
    byteWindow += snap.bytes;
    snapshots.push({ ...snap, time: lastSnapshotAt });
    while (snapshots.length > 6) snapshots.shift();
    const own = snap.ships.find((ship) => ship.id === localId) || (!localId ? snap.ships[0] : null);
    if (!localId && own) { localId = own.id; predicted.id = own.id; }
    if (own) {
      const beforeX = predicted.x; const beforeY = predicted.y; const beforeAngle = predicted.angle;
      Object.assign(predicted, own);
      const replayed = reconcileShip(predicted, naive ? [] : pending, own.lastAckSeq ?? asSeq(0));
      pending.splice(0, pending.length, ...pending.filter(item => item.seq > (own.lastAckSeq ?? 0)));
      if (!naive) Object.assign(predicted, replayed.ship);
      correctionX = beforeX - predicted.x; correctionY = beforeY - predicted.y;
      correctionAngle = beforeAngle - predicted.angle; correctionLeft = 0.1;
      net.correction = Math.hypot(correctionX, correctionY);
      predictedBullets.splice(0, predictedBullets.length, ...predictedBullets.filter((bullet) => bullet.born > lastSnapshotAt - 450));
    }
  });
  connection.connect({ room: room.id, name: playerName });

  let remoteState: SnapshotShip[] = [];
  Object.assign(window, { dogfightRemoteState: () => remoteState.map(s => ({id:s.id,x:s.x,y:s.y})) });
  let accumulator = 0; let previous = performance.now(); let frames = 0; let fpsAt = previous; let fps = 0; let steps = 0; let stepsAt = previous; let stepRate = 0;
  function render(now: number) {
    frameStats.add(now - previous);
    const elapsed = Math.min(0.1, (now - previous) / 1000); previous = now; accumulator += elapsed;
    while (accumulator >= DT) {
      const controls = readInput(); seq += 1;
      const command = { ...controls, seq: asSeq(seq), tick: asTick(state.tick + 1) };
      pending.push(command); sentAt.set(seq, performance.now()); if (pending.length > 120) pending.shift();
      if (!naive) integrateShip(predicted, command, DT);
      if (!naive && command.fire) { addLocalBullet(predicted, seq); gameplayEvents.emit("fired", {shooter: predicted.id}); audio?.play("shotSound", 0.22); }
      if (drift && !naive) predicted.x = (predicted.x + (Math.random() - 0.5) * 4 + 1100) % 1100;
      connection?.sendInput(command);
      input.endFrame(); accumulator -= DT; steps += 1;
    }
    if (correctionLeft > 0) {
      const fraction = Math.min(1, elapsed / correctionLeft);
      correctionX *= 1 - fraction; correctionY *= 1 - fraction; correctionAngle *= 1 - fraction; correctionLeft = Math.max(0, correctionLeft - elapsed);
    }
    snapshotAge = now - lastSnapshotAt;
    if (now - byteWindowAt >= 1000) { bytesPerSecond = byteWindow; byteWindow = 0; byteWindowAt = now; }
    if (now - fpsAt >= 1000) { fps = frames; frames = 0; fpsAt = now; }
    if (now - stepsAt >= 1000) { stepRate = steps; steps = 0; stepsAt = now; }
    frames += 1;
    const ctx = view.ctx; drawBackground(ctx, view.width, view.height);
    const renderTime = now - 100;
    let remoteShips: SnapshotShip[] = [];
    if (snapshots.length >= 2) {
      let a = snapshots[0]!, b = snapshots[1]!;
      for (let i = 0; i < snapshots.length - 1; i += 1) if (snapshots[i]!.time <= renderTime && snapshots[i + 1]!.time >= renderTime) { a = snapshots[i]!; b = snapshots[i + 1]!; break; }
      const alpha = b.time === a.time ? 1 : Math.max(0, Math.min(1, (renderTime - a.time) / (b.time - a.time)));
      remoteShips = a.ships.filter((ship) => ship.id !== localId).map((ship) => { const other = b.ships.find((item) => item.id === ship.id) || ship; return { ...ship, x: ship.x + (other.x - ship.x) * alpha, y: ship.y + (other.y - ship.y) * alpha, angle: ship.angle + (other.angle - ship.angle) * alpha }; });
    } else remoteShips = state.ships.filter((ship) => ship.id !== localId);
    remoteState = remoteShips;
    for (const asteroid of state.asteroids ?? []) drawNetAsteroid(ctx, asteroid);
    for (const ship of remoteShips) drawNetShip(ctx, ship, '#f9a8d4');
    const visualShip = { ...predicted, x: predicted.x + correctionX, y: predicted.y + correctionY, angle: predicted.angle + correctionAngle };
    drawNetShip(ctx, visualShip, '#dbeafe', true);
    const latest = snapshots[snapshots.length - 1];
    if (latest) for (const bullet of latest.bullets) drawNetBullet(ctx, bullet, bullet.owner === localId ? '#fbbf24' : '#f9a8d4');
    for (const bullet of predictedBullets) drawNetBullet(ctx, { ...bullet, x: bullet.x + bullet.vx * Math.max(0, (now - bullet.born) / 1000), y: bullet.y + bullet.vy * Math.max(0, (now - bullet.born) / 1000) }, '#fbbf24');
    net.rtt = rtt; net.snapshotAge = snapshotAge; net.bytesPerSecond = bytesPerSecond; net.queue = pending.length;
    ctx.fillStyle = '#dbeafe'; ctx.font = '13px ui-monospace, monospace';
    ctx.fillText(`SERVER TICK: ${latest?.tick ?? 0} | FPS ${fps} | steps/s ${stepRate} | ${deploymentSha}`, 12, 20);
    ctx.fillText(`RTT ${net.rtt.toFixed(0)} ms | snapshot age ${net.snapshotAge.toFixed(0)} ms | ${net.bytesPerSecond} B/s`, 12, 40);
    ctx.fillText(`input queue ${net.queue} | correction ${net.correction.toFixed(1)} px | ${net.mode}`, 12, 60);
    ctx.fillStyle = '#94a3b8'; ctx.fillText('W/↑ gas · A/D/←/→ turn · Space/F fire · чужі кораблі відстають на 100 мс', 12, view.height - 14);
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
}

function drawNetShip(ctx: CanvasRenderingContext2D, ship: SnapshotShip | Ship, color: string, own = false) {
  ctx.save(); ctx.translate(ship.x, ship.y); ctx.rotate(ship.angle); ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(-12, -10); ctx.lineTo(-7, 0); ctx.lineTo(-12, 10); ctx.closePath(); ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = own ? '#60a5fa' : '#f472b6'; ctx.stroke();
  ctx.rotate(-ship.angle); ctx.fillStyle = '#e2e8f0'; ctx.font = '11px system-ui'; ctx.textAlign = 'center'; ctx.fillText(ship.name || (own ? 'YOU' : `P${ship.id}`), 0, -22); ctx.restore();
}
function drawNetAsteroid(ctx: CanvasRenderingContext2D, asteroid: Asteroid) {
  ctx.save(); ctx.translate(asteroid.x, asteroid.y);
  ctx.beginPath();
  for (let i = 0; i < 9; i += 1) {
    const angle = i * Math.PI * 2 / 9;
    const radius = asteroid.radius * (0.82 + 0.18 * Math.sin(i * 7.13));
    const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath(); ctx.fillStyle = '#475569'; ctx.strokeStyle = '#94a3b8';
  ctx.fill(); ctx.stroke(); ctx.restore();
}
function drawNetBullet(ctx: CanvasRenderingContext2D, bullet: SnapshotBullet | PredictBullet, color: string) { ctx.beginPath(); ctx.arc(bullet.x, bullet.y, 3, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); }

function startGame(assets: Record<string, unknown>, room: LobbyRoom, playerName: string, audio: GameAudio) {
  if (gameStarted) return;
  gameStarted = true;
  lobby.hide();
  lobbyElement.hidden = true;
  canvas.setAttribute("aria-label", `Мережева гра гравця ${playerName}`);
  startNetworkGame(room, playerName, audio);
}

lobbyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!loadedAssets) {
    lobbyStatus.textContent = "Зачекай, поки завантажаться ресурси.";
    return;
  }
  const playerName = playerNameInput.value.trim();
  const room = lobby.rooms.find((item) => item.id === roomSelect.value);
  if (!playerName) {
    lobbyStatus.textContent = "Введи ім'я гравця.";
    playerNameInput.focus();
    return;
  }
  if (!room) {
    lobbyStatus.textContent = "Вибери доступну кімнату.";
    return;
  }
  try {
    await audioContext.resume();
    const audio = new GameAudio(audioContext, { shotSound: loadedAssets.shotSound instanceof AudioBuffer ? loadedAssets.shotSound : undefined, hitSound: loadedAssets.hitSound instanceof AudioBuffer ? loadedAssets.hitSound : undefined });
    startGame(loadedAssets, room, playerName, audio);
  } catch (error) {
    lobbyStatus.textContent = `Не вдалося ввімкнути звук: ${messageOf(error)}`;
  }
});

async function boot() {
  gameStarted = false;
  loadedAssets = null;
  joinButton.disabled = true;
  lobbyElement.hidden = true;
  const assets = await loadResources();
  if (!assets) return;
  loadedAssets = assets;
  lobbyElement.hidden = false;
  lobby.show();
}

boot();

if ("serviceWorker" in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) { navigator.serviceWorker.register("/sw.js").catch(() => {}); }
