export function setupCanvas(canvas) {
  const ctx = canvas.getContext("2d");

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
