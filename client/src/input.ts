export function createInput(target: Window = window) {
  const down = new Set<string>();
  const pressed = new Set<string>();

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
    isDown: (code: string) => down.has(code),
    justPressed: (code: string) => pressed.has(code),
    endFrame: () => pressed.clear(),
  };
}
