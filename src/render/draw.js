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
  // Small stars add depth without requiring image assets.
  ctx.fillStyle = "rgba(219,234,254,.5)";
  for (let i = 0; i < 35; i += 1) {
    const x = (i * 137.5) % Math.max(width, 1);
    const y = (i * 83.7) % Math.max(height, 1);
    ctx.fillRect(x, y, 1.5, 1.5);
  }
}

export function drawWorld(ctx, world, stats) {
  for (const entity of world) {
    if (entity.dead) continue;
    if (entity.kind === "ship") drawShip(ctx, entity);
    else if (entity.kind === "bullet") drawBullet(ctx, entity);
    else if (entity.kind === "asteroid") drawAsteroid(ctx, entity);
    else if (entity.kind === "pickup") drawPickup(ctx, entity);
    else if (entity.kind === "explosion") drawExplosion(ctx, entity);
  }
  drawHud(ctx, world, stats);
}

function drawShip(ctx, ship) {
  ctx.save();
  ctx.translate(ship.position.x, ship.position.y);
  ctx.rotate(ship.angle);
  ctx.globalAlpha =
    ship.invulnerable > 0
      ? Math.floor(performance.now() / 100) % 2
        ? 0.35
        : 1
      : 1;
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

function drawBullet(ctx, bullet) {
  ctx.beginPath();
  ctx.arc(bullet.position.x, bullet.position.y, bullet.radius, 0, Math.PI * 2);
  ctx.fillStyle = bullet.behavior ? "#c4b5fd" : "#fbbf24";
  ctx.shadowColor = ctx.fillStyle;
  ctx.shadowBlur = 10;
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawAsteroid(ctx, asteroid) {
  ctx.save();
  ctx.translate(asteroid.position.x, asteroid.position.y);
  ctx.rotate(asteroid.angle);
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
  ctx.fillStyle = "#dbeafe";
  ctx.font = "13px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(`HP: ${ship?.hp ?? 0}/3`, 12, 20);
  ctx.fillText(`Score: ${ship?.score ?? 0}`, 12, 40);
  ctx.fillText(`Asteroids: ${[...world.ofKind("asteroid")].length}`, 12, 60);
  ctx.fillStyle = "#94a3b8";
  ctx.fillText(
    `steps/s: ${stats.stepsPerSecond} · frames/s: ${stats.framesPerSecond} · ${stats.frameTimeMs.toFixed(1)} ms`,
    12,
    80,
  );
  if (ship?.dead) {
    ctx.fillStyle = "#fca5a5";
    ctx.font = "bold 22px system-ui";
    ctx.fillText(
      "RESPAWNING…",
      Math.max(12, world.width / 2 - 80),
      world.height / 2,
    );
  }
  ctx.font = "12px system-ui";
  ctx.fillStyle = "#9aa7ba";
  ctx.fillText(
    "W/↑ thrust · A/D or ←/→ rotate · SPACE/F fire · collect green pickups",
    12,
    world.height - 14,
  );
}
