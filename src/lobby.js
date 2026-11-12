import { loadJson } from "./assets/loader.js";

export class Lobby extends EventTarget {
  constructor({ statusElement, roomSelect, joinButton, intervalMs = 10000 }) {
    super();
    this.statusElement = statusElement;
    this.roomSelect = roomSelect;
    this.joinButton = joinButton;
    this.intervalMs = intervalMs;
    this.rooms = [];
    this.visible = false;
    this.controller = null;
    this.intervalId = null;
  }

  async refresh() {
    this.controller?.abort();
    this.controller = new AbortController();
    const controller = this.controller;
    this.statusElement.textContent = "Завантаження доступних кімнат...";
    try {
      const timeoutSignal = AbortSignal.timeout(5000);
      const signal = AbortSignal.any([controller.signal, timeoutSignal]);
      const data = await loadJson("/api/rooms", signal);
      if (controller.signal.aborted || !this.visible) return;
      if (!Array.isArray(data.rooms) || data.rooms.length === 0) {
        throw new Error("Список кімнат порожній або має неправильний формат");
      }
      this.rooms = data.rooms;
      const selected = this.roomSelect.value;
      this.roomSelect.replaceChildren();
      for (const room of this.rooms) {
        const option = document.createElement("option");
        option.value = room.id;
        option.textContent = `${room.name} — ${room.description}`;
        this.roomSelect.append(option);
      }
      if (this.rooms.some((room) => room.id === selected)) this.roomSelect.value = selected;
      this.joinButton.disabled = false;
      this.statusElement.textContent = `${this.rooms.length} кімнат доступно. Вибери арену та приєднуйся.`;
      this.dispatchEvent(new CustomEvent("rooms-updated", { detail: this.rooms }));
    } catch (error) {
      if (controller.signal.aborted || !this.visible) return;
      console.error("Не вдалося завантажити кімнати:", error);
      this.statusElement.textContent = "Не вдалося завантажити кімнати. ";
      const retryButton = document.createElement("button");
      retryButton.type = "button";
      retryButton.textContent = "Повторити";
      retryButton.addEventListener("click", () => this.refresh(), { once: true });
      this.statusElement.append(retryButton);
      this.joinButton.disabled = true;
    }
  }

  show() {
    if (this.visible) return;
    this.visible = true;
    this.refresh();
    this.intervalId = setInterval(() => {
      if (this.visible && !document.hidden) this.refresh();
    }, this.intervalMs);
  }

  hide() {
    this.visible = false;
    this.controller?.abort();
    this.controller = null;
    if (this.intervalId !== null) clearInterval(this.intervalId);
    this.intervalId = null;
  }
}
