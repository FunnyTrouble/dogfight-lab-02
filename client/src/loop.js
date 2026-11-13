export function createLoop({
  step = 1 / 60,
  simulate,
  render,
  onStats = () => {},
}) {
  let running = false;
  let rafId = 0;
  let accumulator = 0;
  let last = performance.now();

  let stepsThisSecond = 0;
  let framesThisSecond = 0;
  let statsSecond = performance.now();

  const stats = {
    stepsPerSecond: 0,
    framesPerSecond: 0,
    frameTimeMs: 0,
  };

  function frame(now) {
    if (!running) {
      return;
    }

    const frameStart = performance.now();

    const elapsed = Math.min((now - last) / 1000, 0.25);
    last = now;
    accumulator += elapsed;

    let steps = 0;
    while (accumulator >= step) {
      simulate(step);
      accumulator -= step;
      steps += 1;
    }

    const alpha = accumulator / step;
    render(alpha);

    stepsThisSecond += steps;
    framesThisSecond += 1;

    if (now - statsSecond >= 1000) {
      stats.stepsPerSecond = stepsThisSecond;
      stats.framesPerSecond = framesThisSecond;
      statsSecond = now;
      stepsThisSecond = 0;
      framesThisSecond = 0;
      onStats({ ...stats });
    }

    stats.frameTimeMs = performance.now() - frameStart;
    onStats({ ...stats });

    rafId = requestAnimationFrame(frame);
  }

  function start() {
    if (running) {
      return;
    }

    running = true;
    last = performance.now();
    statsSecond = last;
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(rafId);
  }

  return { start, stop };
}
