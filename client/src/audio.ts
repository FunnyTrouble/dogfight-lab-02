export class GameAudio {
  readonly context: AudioContext;
  readonly buffers: Record<string, AudioBuffer | undefined>;
  constructor(context: AudioContext, buffers: Record<string, AudioBuffer | undefined> = {}) {
    this.context = context;
    this.buffers = buffers;
  }

  async unlock() {
    if (this.context.state === "suspended") await this.context.resume();
  }

  play(name: string, volume = 0.35) {
    const buffer = this.buffers[name];
    if (!buffer || this.context.state !== "running") return;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(this.context.destination);
    source.start();
  }
}
