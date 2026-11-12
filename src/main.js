import "./style.css";
import { createInput } from "./input.js";
import { createLoop } from "./loop.js";
import { World } from "./sim/world.js";
import { Ship } from "./sim/ship.js";
import { Asteroid } from "./sim/asteroid.js";
import { Vector2 } from "./sim/vector2.js";
import { setupCanvas } from "./render/canvas.js";
import { drawBackground, drawWorld } from "./render/draw.js";
import { loadJson, loadAll } from "./assets/loader.js";
import { Lobby } from "./lobby.js";
import { GameAudio } from "./audio.js";

const canvas = document.querySelector("#game");
const lobbyElement = document.querySelector("#lobby");
const lobbyForm = document.querySelector("#lobby-form");
const playerNameInput = document.querySelector("#player-name");
const roomSelect = document.querySelector("#room-select");
const lobbyStatus = document.querySelector("#lobby-status");
const joinButton = document.querySelector("#join-button");
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
  ctx.fillText("DOGFIGHT — LAB 03", width / 2, height / 2 - 55);
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

function startGame(assets, room, playerName, audio) {
  if (gameStarted) return;
  gameStarted = true;
  lobby.hide();
  lobbyElement.hidden = true;
  canvas.setAttribute("aria-label", `Гра гравця ${playerName}`);
  const input = createInput(window);
  const asteroidCount = Number(room.asteroids) || 4;
  const world = new World(view.width, view.height, asteroidCount);
  world.spawn(new Ship(view.width / 2, view.height / 2));
  for (let i = 0; i < asteroidCount; i += 1) {
    const x = 70 + Math.random() * Math.max(1, view.width - 140);
    const y = 70 + Math.random() * Math.max(1, view.height - 140);
    world.spawn(new Asteroid(x, y, Vector2.fromAngle(Math.random() * Math.PI * 2).scale(25), 18 + Math.random() * 12));
  }
  world.addEventListener("fired", () => audio.play("shotSound", 0.22));
  world.addEventListener("hit", () => audio.play("hitSound", 0.38));
  world.addEventListener("exploded", () => audio.play("hitSound", 0.24));
  const stats = { stepsPerSecond: 0, framesPerSecond: 0, frameTimeMs: 0 };
  console.log(`Гравець: ${playerName}; кімната: ${room.name}`);
  function simulate(dt) {
    world.width = view.width;
    world.height = view.height;
    world.step(dt, input);
    input.endFrame();
  }
  function render() {
    drawBackground(view.ctx, view.width, view.height);
    drawWorld(view.ctx, world, stats, assets);
  }
  createLoop({ step: 1 / 60, simulate, render, onStats: (nextStats) => Object.assign(stats, nextStats) }).start();
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
