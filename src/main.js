import "./style.css";
import { createInput } from "./input.js";
import { createLoop } from "./loop.js";
import { World } from "./sim/world.js";
import { Ship } from "./sim/ship.js";
import { Asteroid } from "./sim/asteroid.js";
import { Vector2 } from "./sim/vector2.js";
import { setupCanvas } from "./render/canvas.js";
import { drawBackground, drawWorld } from "./render/draw.js";

const canvas = document.querySelector("#game");
const view = setupCanvas(canvas);
const input = createInput(window);
const world = new World(view.width, view.height);
world.spawn(new Ship(view.width / 2, view.height / 2));

// Start with a few obstacles so the player can test shooting immediately.
for (let i = 0; i < 4; i += 1) {
  const x = 70 + Math.random() * Math.max(1, view.width - 140);
  const y = 70 + Math.random() * Math.max(1, view.height - 140);
  world.spawn(
    new Asteroid(
      x,
      y,
      Vector2.fromAngle(Math.random() * Math.PI * 2).scale(25),
      18 + Math.random() * 12,
    ),
  );
}

const stats = { stepsPerSecond: 0, framesPerSecond: 0, frameTimeMs: 0 };
function simulate(dt) {
  world.width = view.width;
  world.height = view.height;
  world.step(dt, input);
  input.endFrame();
}

function render() {
  drawBackground(view.ctx, view.width, view.height);
  drawWorld(view.ctx, world, stats);
}

const loop = createLoop({
  step: 1 / 60,
  simulate,
  render,
  onStats: (nextStats) => Object.assign(stats, nextStats),
});
loop.start();
