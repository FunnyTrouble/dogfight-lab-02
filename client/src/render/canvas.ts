export function setupCanvas(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D not supported");
  const ctx: CanvasRenderingContext2D = context;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    return {
      width: rect.width,
      height: rect.height,
      dpr,
    };
  }

  let size = resize();

  window.addEventListener("resize", () => {
    size = resize();
  });

  return {
    ctx,
    get width() {
      return size.width;
    },
    get height() {
      return size.height;
    },
  };
}
