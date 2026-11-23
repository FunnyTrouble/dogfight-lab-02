import { createShip, integrateShip, DT } from "../../shared/simulation.js";
import "./style.css";
import { createInput } from "./input.js";
import { setupCanvas } from "./render/canvas.js";
import { drawBackground } from "./render/draw.js";
import { loadJson, loadAll } from "./assets/loader.js";
import { Lobby } from "./lobby.js";
import { GameAudio } from "./audio.js";
import { GameConnection } from "./connection.js";

const canvas = document.querySelector("#game");
const lobbyElement = document.querySelector("#lobby");
const lobbyForm = document.querySelector("#lobby-form");
const playerNameInput = document.querySelector("#player-name");
const roomSelect = document.querySelector("#room-select");
const lobbyStatus = document.querySelector("#lobby-status");
const joinButton = document.querySelector("#join-button");
const chatPanel = document.querySelector("#chat-panel");
const connectionStatus = document.querySelector("#connection-status");
const roomRoster = document.querySelector("#room-roster");
const chatMessages = document.querySelector("#chat-messages");
const chatForm = document.querySelector("#chat-form");
const chatText = document.querySelector("#chat-text");
const leaveButton = document.querySelector("#leave-room");
let connection = null;
const view = setupCanvas(canvas);
const audioContext = new AudioContext();
const lobby = new Lobby({ statusElement: lobbyStatus, roomSelect, joinButton });
let loadedAssets = null;
let gameStarted = false;
let retryButton = null;

function drawLoadingProgress(progress) {
  const { ctx, width, height } = view;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#080d18";
  ctx.fillRect(0, 0, width, height);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#e9eef7";
  ctx.font = "bold 26px system-ui";
  ctx.fillText("DOGFIGHT — LAB 05", width / 2, height / 2 - 55);
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

function showLoadingError(errors, retry) {
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
  ctx.fillText(errors.map((item) => `${item.name}: ${item.error?.message ?? "помилка"}`).join("; ").slice(0, 120), width / 2, height / 2 - 12);
  retryButton?.remove();
  retryButton = document.createElement("button");
  retryButton.textContent = "Повторити завантаження";
  retryButton.style.cssText = "display:block;margin:12px auto;padding:10px 18px;cursor:pointer";
  retryButton.addEventListener("click", async () => {
    retryButton.disabled = true;
    retryButton.textContent = "Завантаження...";
    await retry();
  }, { once: true });
  canvas.insertAdjacentElement("afterend", retryButton);
}

async function loadResources() {
  try {
    const manifest = await loadJson("/assets/manifest.json", AbortSignal.timeout(8000));
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

function addChatLine(text) {
  const item = document.createElement("li");
  item.textContent = text;
  chatMessages.append(item);
  while (chatMessages.children.length > 100) chatMessages.firstElementChild.remove();
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

function startNetworkGame(room, playerName, audio) {
  const state = { tick: 0, ships: [], bullets: [], asteroids: [], nextBulletId: 1 };
  const predicted = createShip(0, playerName, 1, 0);
  const input = createInput(window);
  const naive = new URLSearchParams(location.search).get("naive") === "1";
  const drift = new URLSearchParams(location.search).get("drift") === "1";
  const pending = [];
  const snapshots = [];
  const predictedBullets = [];
  let seq = 0; let localId = null; let lastSnapshotAt = performance.now();
  const sentAt = new Map();
  let rtt = 0; let snapshotAge = 0; let bytesPerSecond = 0; let byteWindow = 0; let byteWindowAt = performance.now();
  let correctionX = 0; let correctionY = 0; let correctionAngle = 0; let correctionLeft = 0;
  const net = { rtt: 0, snapshotAge: 0, bytesPerSecond: 0, queue: 0, correction: 0, mode: new URLSearchParams(location.search).get('json') === '1' ? 'JSON comparison' : naive ? 'snapshot only' : drift ? 'drift experiment' : 'binary' };
  function readInput() {
    const turn = (input.isDown('KeyD') || input.isDown('ArrowRight') ? 1 : 0) - (input.isDown('KeyA') || input.isDown('ArrowLeft') ? 1 : 0);
    return { thrust: input.isDown('KeyW') || input.isDown('ArrowUp'), turn, fire: input.justPressed('Space') || input.justPressed('KeyF') };
  }
  function addLocalBullet(ship, tickSeq) {
    predictedBullets.push({ id: -tickSeq, owner: localId || 0, x: ship.x + Math.cos(ship.angle) * 20, y: ship.y + Math.sin(ship.angle) * 20, vx: ship.vx + Math.cos(ship.angle) * 360, vy: ship.vy + Math.sin(ship.angle) * 360, born: performance.now() });
  }
  connection?.close();
  connection = new GameConnection();
  chatPanel.hidden = false; chatMessages.replaceChildren();
  connectionStatus.textContent = 'Підключення до авторитетного сервера...';
  connection.addEventListener('status', (event) => {
    const labels = { connecting: 'Підключення...', connected: "З'єднання встановлено", disconnected: "З'єднання втрачено. Перепідключення...", error: 'Помилка WebSocket', 'invalid-message': 'Некоректний пакет' };
    connectionStatus.textContent = labels[event.detail] || event.detail;
  });
  connection.addEventListener('packet', (event) => {
    const message = event.detail;
    if (message.type === 'joined') { localId = message.id; predicted.id = message.id; connectionStatus.textContent = `Кімната ${message.room}: ${message.name}. Сервер рахує гру.`; }
    else if (message.type === 'roster') roomRoster.textContent = `Учасники (${message.players.length}): ${message.players.join(', ') || '—'}`;
    else if (message.type === 'chat') addChatLine(`${message.name}: ${message.text}`);
    else if (message.type === 'system') addChatLine(`• ${message.text}`);
    else if (message.type === 'error') addChatLine(`Помилка: ${message.message}`);
  });
  connection.addEventListener('snapshot', (event) => {
    const snap = event.detail; lastSnapshotAt = performance.now(); snapshotAge = 0;
    const ack = snap.ships.find((ship) => ship.id === localId)?.lastAckSeq;
    if (ack && sentAt.has(ack)) { rtt = performance.now() - sentAt.get(ack); for (const key of sentAt.keys()) if (key <= ack) sentAt.delete(key); }
    state.tick = snap.tick; state.ships = snap.ships; state.bullets = snap.bullets; state.asteroids = snap.asteroids || [];
    byteWindow += snap.bytes;
    snapshots.push({ ...snap, time: lastSnapshotAt });
    while (snapshots.length > 6) snapshots.shift();
    const own = snap.ships.find((ship) => ship.id === localId) || (!localId ? snap.ships[0] : null);
    if (!localId && own) { localId = own.id; predicted.id = localId; }
    if (own) {
      const beforeX = predicted.x; const beforeY = predicted.y; const beforeAngle = predicted.angle;
      Object.assign(predicted, own);
      const unacked = pending.filter((item) => item.seq > own.lastAckSeq);
      pending.splice(0, pending.length, ...unacked);
      if (!naive) for (const item of pending) integrateShip(predicted, item, DT);
      correctionX = beforeX - predicted.x; correctionY = beforeY - predicted.y;
      correctionAngle = beforeAngle - predicted.angle; correctionLeft = 0.1;
      net.correction = Math.hypot(correctionX, correctionY);
      predictedBullets.splice(0, predictedBullets.length, ...predictedBullets.filter((bullet) => bullet.born > lastSnapshotAt - 450));
    }
  });
  connection.connect({ room: room.id, name: playerName });

  let accumulator = 0; let previous = performance.now(); let frames = 0; let fpsAt = previous; let fps = 0; let steps = 0; let stepsAt = previous; let stepRate = 0;
  function render(now) {
    const elapsed = Math.min(0.1, (now - previous) / 1000); previous = now; accumulator += elapsed;
    while (accumulator >= DT) {
      const controls = readInput(); seq += 1;
      const command = { ...controls, seq, tick: state.tick + 1 };
      pending.push(command); sentAt.set(seq, performance.now()); if (pending.length > 120) pending.shift();
      if (!naive) integrateShip(predicted, command, DT);
      if (!naive && command.fire) { addLocalBullet(predicted, seq); audio?.play("shotSound", 0.22); }
      if (drift && !naive) predicted.x = (predicted.x + (Math.random() - 0.5) * 4 + 1100) % 1100;
      connection.sendInput(command);
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
    let remoteShips = [];
    if (snapshots.length >= 2) {
      let a = snapshots[0], b = snapshots[1];
      for (let i = 0; i < snapshots.length - 1; i += 1) if (snapshots[i].time <= renderTime && snapshots[i + 1].time >= renderTime) { a = snapshots[i]; b = snapshots[i + 1]; break; }
      const alpha = b.time === a.time ? 1 : Math.max(0, Math.min(1, (renderTime - a.time) / (b.time - a.time)));
      remoteShips = a.ships.filter((ship) => ship.id !== localId).map((ship) => { const other = b.ships.find((item) => item.id === ship.id) || ship; return { ...ship, x: ship.x + (other.x - ship.x) * alpha, y: ship.y + (other.y - ship.y) * alpha, angle: ship.angle + (other.angle - ship.angle) * alpha }; });
    } else remoteShips = state.ships.filter((ship) => ship.id !== localId);
    for (const asteroid of state.asteroids) drawNetAsteroid(ctx, asteroid);
    for (const ship of remoteShips) drawNetShip(ctx, ship, '#f9a8d4');
    const visualShip = { ...predicted, x: predicted.x + correctionX, y: predicted.y + correctionY, angle: predicted.angle + correctionAngle };
    drawNetShip(ctx, visualShip, '#dbeafe', true);
    const latest = snapshots[snapshots.length - 1];
    if (latest) for (const bullet of latest.bullets) drawNetBullet(ctx, bullet, bullet.owner === localId ? '#fbbf24' : '#f9a8d4');
    for (const bullet of predictedBullets) drawNetBullet(ctx, { ...bullet, x: bullet.x + bullet.vx * Math.max(0, (now - bullet.born) / 1000), y: bullet.y + bullet.vy * Math.max(0, (now - bullet.born) / 1000) }, '#fbbf24');
    net.rtt = rtt; net.snapshotAge = snapshotAge; net.bytesPerSecond = bytesPerSecond; net.queue = pending.length;
    ctx.fillStyle = '#dbeafe'; ctx.font = '13px ui-monospace, monospace';
    ctx.fillText(`SERVER TICK: ${latest?.tick ?? 0} | FPS ${fps} | steps/s ${stepRate}`, 12, 20);
    ctx.fillText(`RTT ${net.rtt.toFixed(0)} ms | snapshot age ${net.snapshotAge.toFixed(0)} ms | ${net.bytesPerSecond} B/s`, 12, 40);
    ctx.fillText(`input queue ${net.queue} | correction ${net.correction.toFixed(1)} px | ${net.mode}`, 12, 60);
    ctx.fillStyle = '#94a3b8'; ctx.fillText('W/↑ gas · A/D/←/→ turn · Space/F fire · чужі кораблі відстають на 100 мс', 12, view.height - 14);
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
}

function drawNetShip(ctx, ship, color, own = false) {
  ctx.save(); ctx.translate(ship.x, ship.y); ctx.rotate(ship.angle); ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(-12, -10); ctx.lineTo(-7, 0); ctx.lineTo(-12, 10); ctx.closePath(); ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = own ? '#60a5fa' : '#f472b6'; ctx.stroke();
  ctx.rotate(-ship.angle); ctx.fillStyle = '#e2e8f0'; ctx.font = '11px system-ui'; ctx.textAlign = 'center'; ctx.fillText(ship.name || (own ? 'YOU' : `P${ship.id}`), 0, -22); ctx.restore();
}
function drawNetAsteroid(ctx, asteroid) {
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
function drawNetBullet(ctx, bullet, color) { ctx.beginPath(); ctx.arc(bullet.x, bullet.y, 3, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); }

function startGame(assets, room, playerName, audio) {
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
    const audio = new GameAudio(audioContext, { shotSound: loadedAssets.shotSound, hitSound: loadedAssets.hitSound });
    startGame(loadedAssets, room, playerName, audio);
  } catch (error) {
    lobbyStatus.textContent = `Не вдалося ввімкнути звук: ${error.message}`;
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
