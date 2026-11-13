export function createInput(target = window) {
  const down = new Set();
  const pressed = new Set();

  function isTyping(event) {
    const element = event.target;

    return (
      element?.matches?.("input, textarea, select") === true ||
      element?.isContentEditable === true
    );
  }

  target.addEventListener("keydown", (event) => {
    if (isTyping(event)) {
      return;
    }

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
