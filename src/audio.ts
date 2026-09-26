/** Small original procedural soundscape; no external audio assets. */
export class Soundscape {
  private context: AudioContext | null = null;
  private bed: { oscillator: OscillatorNode; gain: GainNode }[] = [];
  enabled = false;
  async toggle() {
    if (!this.context) this.context = new AudioContext();
    await this.context.resume();
    this.enabled = !this.enabled;
    if (this.enabled) {
      [130.81, 196, 261.63, 293.66].forEach((frequency, i) => {
        const oscillator = this.context!.createOscillator();
        const gain = this.context!.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.value = 0;
        gain.gain.linearRampToValueAtTime(0.012 / (i + 1), this.context!.currentTime + 2);
        oscillator.connect(gain).connect(this.context!.destination);
        oscillator.start();
        this.bed.push({ oscillator, gain });
      });
    } else {
      for (const { oscillator, gain } of this.bed) {
        gain.gain.linearRampToValueAtTime(0, this.context.currentTime + 0.3);
        oscillator.stop(this.context.currentTime + 0.4);
      }
      this.bed = [];
    }
    return this.enabled;
  }
  play(kind: string) {
    if (!this.enabled || !this.context) return;
    const ctx = this.context;
    const pitches =
      kind === 'victory'
        ? [329.63, 392, 523.25, 659.25]
        : kind === 'heal' || kind === 'skill'
          ? [523.25, 659.25, 783.99]
          : kind === 'guard'
            ? [196, 293.66]
            : [220, 110];
    pitches.forEach((pitch, index) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const at = ctx.currentTime + index * 0.085;
      oscillator.type = kind === 'attack' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(pitch, at);
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.06, at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.5);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.55);
    });
  }
  destroy() {
    this.context?.close();
    this.context = null;
    this.bed = [];
    this.enabled = false;
  }
}
