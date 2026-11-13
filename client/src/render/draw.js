export function drawBackground(ctx, width, height) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#05070b";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(120, 150, 190, 0.12)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= width; x += 50) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += 50) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(219,234,254,.5)";
  for (let i = 0; i < 35; i += 1) {
    const x = (i * 137.5) % Math.max(width, 1);
    const y = (i * 83.7) % Math.max(height, 1);
    ctx.fillRect(x, y, 1.5, 1.5);
  }
}

export function drawWorld(ctx, world, stats, assets = {}) {
  const sprites = assets.sprites;

  for (const entity of world) {
    if (entity.dead) continue;

    if (entity.kind === "ship") drawShip(ctx, entity, sprites);
    else if (entity.kind === "bullet") drawBullet(ctx, entity, sprites);
    else if (entity.kind === "asteroid") drawAsteroid(ctx, entity, sprites);
    else if (entity.kind === "pickup") drawPickup(ctx, entity);
    else if (entity.kind === "explosion") drawExplosion(ctx, entity);
  }

  drawHud(ctx, world, stats);
}

function drawShip(ctx, ship, sprites) {
  ctx.save();
  ctx.translate(ship.position.x, ship.position.y);

  ctx.rotate(ship.angle + (sprites ? Math.PI / 2 : 0));

  ctx.globalAlpha =
    ship.invulnerable > 0
      ? Math.floor(performance.now() / 100) % 2
        ? 0.35
        : 1
      : 1;

  if (sprites) {
    ctx.drawImage(sprites, 0, ship.thrust ? 0 : 64, 64, 64, -32, -32, 64, 64);

    ctx.restore();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(19, 0);
  ctx.lineTo(-12, -10);
  ctx.lineTo(-7, 0);
  ctx.lineTo(-12, 10);
  ctx.closePath();
  ctx.fillStyle = "#dbeafe";
  ctx.fill();
  ctx.strokeStyle = "#60a5fa";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  if (ship.thrust) {
    ctx.beginPath();
    ctx.moveTo(-8, -5);
    ctx.lineTo(-25 - Math.random() * 5, 0);
    ctx.lineTo(-8, 5);
    ctx.closePath();
    ctx.fillStyle = "#fbbf24";
    ctx.fill();
  }

  ctx.restore();
}

function drawBullet(ctx, bullet, sprites) {
  if (sprites) {
    const size = Math.max(12, bullet.radius * 4);

    ctx.drawImage(
      sprites,
      64,
      0,
      32,
      32,
      bullet.position.x - size / 2,
      bullet.position.y - size / 2,
      size,
      size,
    );

    return;
  }

  ctx.beginPath();
  ctx.arc(bullet.position.x, bullet.position.y, bullet.radius, 0, Math.PI * 2);
  ctx.fillStyle = bullet.behavior ? "#c4b5fd" : "#fbbf24";
  ctx.shadowColor = ctx.fillStyle;
  ctx.shadowBlur = 10;
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawAsteroid(ctx, asteroid, sprites) {
  ctx.save();
  ctx.translate(asteroid.position.x, asteroid.position.y);
  ctx.rotate(asteroid.angle);

  if (sprites) {
    // Використовуємо два різні кадри астероїдів.
    const spriteX = asteroid.radius > 24 ? 160 : 96;
    const size = asteroid.radius * 2;

    ctx.drawImage(
      sprites,
      spriteX,
      0,
      64,
      64,
      -size / 2,
      -size / 2,
      size,
      size,
    );

    ctx.restore();
    return;
  }

  ctx.beginPath();
  const sides = 9;

  for (let i = 0; i < sides; i += 1) {
    const angle = (i / sides) * Math.PI * 2;
    const radius = asteroid.radius * (0.78 + 0.22 * Math.sin(i * 7.13));
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;

    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }

  ctx.closePath();
  ctx.fillStyle = "#475569";
  ctx.fill();
  ctx.strokeStyle = "#94a3b8";
  ctx.stroke();

  ctx.restore();
}

function drawPickup(ctx, pickup) {
  ctx.save();
  ctx.translate(pickup.position.x, pickup.position.y);
  ctx.rotate(pickup.rotation);
  ctx.beginPath();
  ctx.moveTo(0, -pickup.radius);
  ctx.lineTo(pickup.radius, 0);
  ctx.lineTo(0, pickup.radius);
  ctx.lineTo(-pickup.radius, 0);
  ctx.closePath();
  ctx.fillStyle = "#34d399";
  ctx.fill();
  ctx.strokeStyle = "#a7f3d0";
  ctx.stroke();
  ctx.restore();
}

function drawExplosion(ctx, explosion) {
  const alpha = Math.max(0, explosion.ttl / 0.45);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#fb923c";
  for (const particle of explosion.particles) {
    ctx.beginPath();
    ctx.arc(
      explosion.position.x + particle.position.x,
      explosion.position.y + particle.position.y,
      particle.size,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.restore();
}

function drawHud(ctx, world, stats) {
  const ship = world.player;
  const margin = 12;
  const maxWidth = Math.max(0, world.width - margin * 2);

  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = "#dbeafe";
  ctx.font = "13px ui-monospace, SFMono-Regular, Menlo, monospace";

  ctx.fillText(`HP: ${ship?.hp ?? 0}/3`, margin, 20);
  ctx.fillText(`Score: ${ship?.score ?? 0}`, margin, 40);
  ctx.fillText(
    `Asteroids: ${[...world.ofKind("asteroid")].length}`,
    margin,
    60,
  );

  ctx.fillStyle = "#94a3b8";

  const fpsText =
    `FPS: ${stats.framesPerSecond} | ` +
    `Steps/s: ${stats.stepsPerSecond} | ` +
    `${stats.frameTimeMs.toFixed(1)} ms`;

  ctx.fillText(fpsText, margin, 80, maxWidth);

  if (ship?.dead) {
    ctx.fillStyle = "#fca5a5";
    ctx.font = "bold 22px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("RESPAWNING...", world.width / 2, world.height / 2, maxWidth);
    ctx.textAlign = "left";
  }

  ctx.font = "12px system-ui";
  ctx.fillStyle = "#9aa7ba";

  const controls = [
    "W / Up: thrust | A / D: rotate",
    "Space / F: fire | Green: pickups",
  ];

  const lineHeight = 16;
  const firstLineY = world.height - margin - lineHeight;

  controls.forEach((line, index) => {
    ctx.fillText(line, margin, firstLineY + index * lineHeight, maxWidth);
  });

  ctx.restore();
}
