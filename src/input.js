export function createInput(target = window) {
  const down = new Set();
  const pressed = new Set();

  target.addEventListener("keydown", (event) => {
    if (!event.repeat) {
      pressed.add(event.code);
    }
    down.add(event.code);

    if (
      ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(
        event.code,
      )
    ) {
      event.preventDefault();
    }
  });

  target.addEventListener("keyup", (event) => {
    down.delete(event.code);
  });

  return {
    isDown: (code) => down.has(code),
    justPressed: (code) => pressed.has(code),
    endFrame: () => pressed.clear(),
  };
}
