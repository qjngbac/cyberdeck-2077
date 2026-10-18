import { SoundFX } from './SoundFX';

/**
 * CyberRadio - Infinite procedural Synthwave / Lofi FM music generator.
 * Uses Web Audio API oscillator synthesis, noise generators, filters, and arpeggios.
 * Completely zero-dependency, zero network footprint, infinite variation.
 */
export class CyberRadio {
  private static ctx: AudioContext | null = null;
  private static isPlaying: boolean = false;
  private static masterGain: GainNode | null = null;
  private static loopTimer: number | null = null;
  private static stepIndex: number = 0;
  private static volume: number = 0.25;

  private static CHORD_PROGRESSIONS = [
    // Am - F - C - G (Classic retro synthwave minor)
    [
      [220.0, 261.63, 329.63, 392.0],  // Am7 (A3, C4, E4, G4)
      [174.61, 220.0, 261.63, 329.63], // Fmaj7 (F3, A3, C4, E4)
      [130.81, 164.81, 196.0, 246.94], // Cmaj7 (C3, E3, G3, B3)
      [196.0, 246.94, 293.66, 349.23], // G7 (G3, B3, D4, F4)
    ],
    // Dm - Bb - F - C (Cyberpunk dark mood)
    [
      [146.83, 174.61, 220.0, 261.63], // Dm7
      [116.54, 146.83, 174.61, 220.0], // Bbmaj7
      [174.61, 220.0, 261.63, 329.63], // Fmaj7
      [130.81, 164.81, 196.0, 246.94], // C7
    ],
  ];

  private static currentProgressionIndex = 0;
  private static currentChordIndex = 0;

  private static initContext(): AudioContext {
    this.ctx = SoundFX.getContext();
    return this.ctx;
  }

  public static start(): void {
    if (this.isPlaying) return;
    const ctx = this.initContext();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    this.isPlaying = true;
    this.masterGain = ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.volume, ctx.currentTime);
    this.masterGain.connect(SoundFX.getMasterGain());

    this.stepIndex = 0;
    this.currentChordIndex = 0;

    // Start 120 BPM 16th-note procedural tick (~125ms per step)
    const stepIntervalMs = 125;
    this.scheduleStep();
    this.loopTimer = window.setInterval(() => {
      this.scheduleStep();
    }, stepIntervalMs);
  }

  public static stop(): void {
    if (!this.isPlaying) return;
    this.isPlaying = false;

    if (this.loopTimer !== null) {
      clearInterval(this.loopTimer);
      this.loopTimer = null;
    }

    // Detach synchronously and fade the *captured* node. Reading this.masterGain
    // inside the 200ms timeout used to disconnect whichever bus a quick restart had
    // just created — the radio then went permanently silent while still "playing".
    const dying = this.masterGain;
    this.masterGain = null;
    if (dying && this.ctx) {
      try {
        dying.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      } catch {
        // node already detached
      }
      window.setTimeout(() => {
        try {
          dying.disconnect();
        } catch {
          // already disconnected
        }
      }, 250);
    }
  }

  public static toggle(): boolean {
    if (this.isPlaying) {
      this.stop();
      return false;
    } else {
      this.start();
      return true;
    }
  }

  public static setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }

  public static getIsPlaying(): boolean {
    return this.isPlaying;
  }

  private static scheduleStep(): void {
    if (!this.ctx || !this.masterGain || !this.isPlaying) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const step = this.stepIndex % 16;

    // Change chord every 16 steps (1 bar)
    if (step === 0) {
      const progression = this.CHORD_PROGRESSIONS[this.currentProgressionIndex];
      this.currentChordIndex = (this.currentChordIndex + 1) % progression.length;
      if (this.currentChordIndex === 0 && Math.random() < 0.3) {
        this.currentProgressionIndex = (this.currentProgressionIndex + 1) % this.CHORD_PROGRESSIONS.length;
      }
      this.playSynthPad(now, progression[this.currentChordIndex]);
    }

    // Drums:
    // Kick on steps 0, 8 (gentle lofi kick)
    if (step === 0 || step === 8) {
      this.playKick(now);
    }
    // Snare / clap on steps 4, 12
    if (step === 4 || step === 12) {
      this.playSnare(now);
    }
    // Hi-hat on even steps 2, 6, 10, 14
    if (step % 2 === 0) {
      this.playHiHat(now, step % 4 === 2);
    }

    // Lead Arpeggio note every 2 steps
    if (step % 2 === 0) {
      const chord = this.CHORD_PROGRESSIONS[this.currentProgressionIndex][this.currentChordIndex];
      const noteFreq = chord[(step / 2) % chord.length] * (Math.random() < 0.4 ? 2 : 1);
      this.playArpNote(now, noteFreq);
    }

    this.stepIndex++;
  }

  // Soft synth pad chord with low-pass filter
  private static playSynthPad(time: number, chordFreqs: number[]): void {
    if (!this.ctx || !this.masterGain) return;
    const ctx = this.ctx;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(700, time);
    filter.Q.setValueAtTime(2, time);

    const padGain = ctx.createGain();
    padGain.gain.setValueAtTime(0, time);
    padGain.gain.linearRampToValueAtTime(0.08, time + 0.4);
    padGain.gain.exponentialRampToValueAtTime(0.001, time + 2.0);

    filter.connect(padGain);
    padGain.connect(this.masterGain);

    chordFreqs.forEach((freq) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, time);
      // slight detune for vintage analog warmth
      osc.detune.setValueAtTime((Math.random() - 0.5) * 15, time);
      osc.connect(filter);
      osc.start(time);
      osc.stop(time + 2.1);
    });
  }

  // Melodic arpeggio pluck
  private static playArpNote(time: number, freq: number): void {
    if (!this.ctx || !this.masterGain) return;
    const ctx = this.ctx;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, time);

    gain.gain.setValueAtTime(0.04, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.22);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + 0.25);
  }

  // Gentle lofi kick drum
  private static playKick(time: number): void {
    if (!this.ctx || !this.masterGain) return;
    const ctx = this.ctx;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.frequency.setValueAtTime(130, time);
    osc.frequency.exponentialRampToValueAtTime(35, time + 0.12);

    gain.gain.setValueAtTime(0.18, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + 0.2);
  }

  // Soft snare
  private static playSnare(time: number): void {
    if (!this.ctx || !this.masterGain) return;
    const ctx = this.ctx;

    // Filtered noise for snare snap
    const bufferSize = ctx.sampleRate * 0.1;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, time);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.06, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start(time);
    noise.stop(time + 0.13);
  }

  // Soft sizzle hi-hat
  private static playHiHat(time: number, isAccent: boolean): void {
    if (!this.ctx || !this.masterGain) return;
    const ctx = this.ctx;

    const bufferSize = ctx.sampleRate * 0.04;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(7000, time);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(isAccent ? 0.035 : 0.018, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start(time);
    noise.stop(time + 0.05);
  }
}
