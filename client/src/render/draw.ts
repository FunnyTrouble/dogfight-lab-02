export function drawBackground(ctx: CanvasRenderingContext2D, width: number, height: number) {
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


