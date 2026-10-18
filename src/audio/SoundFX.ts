/**
 * Web Audio API Sound Synthesizer Engine - Enhanced Edition
 * 100% Procedural Audio - Zero external files or CDN dependencies needed!
 */

class SoundFXEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private isMuted: boolean = false;
  private currentVolume: number = 0.3;
  private unlockedHandlerAttached: boolean = false;
  private activeAmbiences: Map<string, { stop: () => void; gain: GainNode }> = new Map();

  constructor() {}

  /** True while notes can actually be heard. Scheduling into a suspended context
   *  freezes currentTime, so everything piles up and detonates at once on the
   *  first real gesture. */
  private get blocked(): boolean {
    return !this.ctx || !this.masterGain || this.ctx.state !== 'running';
  }

  private init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.currentVolume, this.ctx.currentTime);
      // A limiter keeps six stacked ambience layers from clipping the output.
      this.limiter = this.ctx.createDynamicsCompressor();
      this.limiter.threshold.setValueAtTime(-12, this.ctx.currentTime);
      this.limiter.knee.setValueAtTime(8, this.ctx.currentTime);
      this.limiter.ratio.setValueAtTime(6, this.ctx.currentTime);
      this.limiter.attack.setValueAtTime(0.004, this.ctx.currentTime);
      this.limiter.release.setValueAtTime(0.12, this.ctx.currentTime);
      this.masterGain.connect(this.limiter);
      this.limiter.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended' && !this.unlockedHandlerAttached) {
      // Browsers refuse to start audio without a gesture; unlock on the first one
      // instead of creating the context in an effect and leaving it suspended.
      this.unlockedHandlerAttached = true;
      const unlock = () => {
        this.ctx?.resume().catch(() => {});
      };
      window.addEventListener('pointerdown', unlock, { once: true });
      window.addEventListener('keydown', unlock, { once: true });
      window.addEventListener('touchstart', unlock, { once: true });
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  /** Call from a user gesture if audio matters immediately (optional). */
  public unlock() {
    this.init();
  }

  public getContext(): AudioContext {
    this.init();
    return this.ctx!;
  }

  public getMasterGain(): GainNode {
    this.init();
    return this.masterGain!;
  }

  public setVolume(vol: number) {
    this.currentVolume = Math.max(0, Math.min(1, vol));
    this.init();
    if (!this.blocked) {
      this.masterGain!.gain.setValueAtTime(this.currentVolume, this.ctx!.currentTime);
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    this.init();
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setValueAtTime(muted ? 0 : this.currentVolume, this.ctx.currentTime);
    }
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  /**
   * 1. 赛博木鱼敲击声
   */
  public playWoodenFish(pitchModifier: number = 1.0) {
    if (this.isMuted) return;
    try {
      this.init();
      if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;
      const now = this.ctx.currentTime;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      const baseFreq = 580 * pitchModifier;
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.4, now + 0.12);

      gain.gain.setValueAtTime(0.7, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      osc.connect(gain);
      gain.connect(this.masterGain);

      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(baseFreq * 1.8, now);
      osc2.frequency.exponentialRampToValueAtTime(baseFreq * 0.9, now + 0.08);

      gain2.gain.setValueAtTime(0.4, now);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc2.connect(gain2);
      gain2.connect(this.masterGain);

      osc.start(now);
      osc2.start(now);
      osc.stop(now + 0.16);
      osc2.stop(now + 0.16);
    } catch {}
  }

  /**
   * 2. 键盘敲击声
   */
  public playKeyClick() {
    if (this.isMuted) return;
    try {
      this.init();
      if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      const freq = 1200 + Math.random() * 400;
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(100, now + 0.025);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.03);
    } catch {}
  }

  /**
   * 3. 金币入账音效
   */
  public playCash() {
    if (this.isMuted) return;
    try {
      this.init();
      if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;
      const now = this.ctx.currentTime;
      [987.77, 1318.51, 1567.98].forEach((freq, i) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.06);
        gain.gain.setValueAtTime(0.2, now + i * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.2);
        osc.connect(gain);
        gain.connect(this.masterGain!);
        osc.start(now + i * 0.06);
        osc.stop(now + i * 0.06 + 0.22);
      });
    } catch {}
  }

  /**
   * 4. 升级 / 胜利号角
   */
  public playLevelUp() {
    if (this.isMuted) return;
    try {
      this.init();
      if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;
      const now = this.ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.09);
        gain.gain.setValueAtTime(0.25, now + idx * 0.09);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.35);
        osc.connect(gain);
        gain.connect(this.masterGain!);
        osc.start(now + idx * 0.09);
        osc.stop(now + idx * 0.09 + 0.36);
      });
    } catch {}
  }

  /**
   * 5. 警报音效
   */
  public playAlert() {
    if (this.isMuted) return;
    try {
      this.init();
      if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.linearRampToValueAtTime(180, now + 0.25);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.26);
    } catch {}
  }

  /**
   * 6. 攻击斩击声
   */
  public playSlash() {
    if (this.isMuted) return;
    try {
      this.init();
      if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.12);
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.13);
    } catch {}
  }

  /**
   * 7. 实时单音琴键演奏 (Piano note synthesis)
   */
  public playPianoNote(freq: number, type: OscillatorType = 'sine') {
    if (this.isMuted) return;
    try {
      this.init();
      if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.41);
    } catch {}
  }

  /**
   * 8. 鼓机与合成器多音轨
   */
  public playDrum(type: 'kick' | 'snare' | 'hihat' | 'openhat' | 'synth1' | 'synth2' | 'arp', freqOffset: number = 0) {
    if (this.isMuted) return;
    try {
      this.init();
      if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;
      const now = this.ctx.currentTime;

      if (type === 'kick') {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(0.01, now + 0.3);
        gain.gain.setValueAtTime(0.8, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.31);
      } else if (type === 'snare') {
        const bufferSize = this.ctx.sampleRate * 0.15;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const output = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
        const whiteNoise = this.ctx.createBufferSource();
        whiteNoise.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 1000;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        whiteNoise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        whiteNoise.start(now);
      } else if (type === 'hihat' || type === 'openhat') {
        const dur = type === 'openhat' ? 0.18 : 0.05;
        const bufferSize = Math.floor(this.ctx.sampleRate * dur);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const output = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 7000;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + dur);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        noise.start(now);
      } else if (type === 'synth1') {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        const baseFreq = (440 + freqOffset) || 440;
        osc.frequency.setValueAtTime(baseFreq, now);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.21);
      } else if (type === 'synth2') {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        const baseFreq = (110 + freqOffset) || 110;
        osc.frequency.setValueAtTime(baseFreq, now);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.26);
      } else if (type === 'arp') {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        const baseFreq = (550 + freqOffset) || 550;
        osc.frequency.setValueAtTime(baseFreq, now);
        gain.gain.setValueAtTime(0.22, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.16);
      }
    } catch {}
  }

  /**
   * 9. 多轨道混音白噪音合成器
   */
  public setAmbienceTrack(id: string, active: boolean, volume: number = 0.5) {
    this.init();
    if (!this.ctx || !this.masterGain) return;

    if (!active) {
      const current = this.activeAmbiences.get(id);
      if (current) {
        current.stop();
        this.activeAmbiences.delete(id);
      }
      return;
    }

    if (this.activeAmbiences.has(id)) {
      const current = this.activeAmbiences.get(id)!;
      current.gain.gain.setValueAtTime(this.isMuted ? 0 : volume * 0.2, this.ctx.currentTime);
      return;
    }

    try {
      const bufferSize = this.ctx.sampleRate * 2;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        data[i] = (lastOut + (0.02 * white)) / 1.02;
        lastOut = data[i];
        data[i] *= 3.5;
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;

      const filter = this.ctx.createBiquadFilter();
      if (id === 'rain') {
        filter.type = 'lowpass';
        filter.frequency.value = 800;
      } else if (id === 'server') {
        filter.type = 'bandpass';
        filter.frequency.value = 350;
      } else if (id === 'cafe') {
        filter.type = 'bandpass';
        filter.frequency.value = 1200;
      } else if (id === 'fire') {
        filter.type = 'lowpass';
        filter.frequency.value = 500;
      } else {
        filter.type = 'highpass';
        filter.frequency.value = 400;
      }

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(this.isMuted ? 0 : volume * 0.2, this.ctx.currentTime);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      noise.start();

      this.activeAmbiences.set(id, {
        gain,
        stop: () => {
          try {
            noise.stop();
            noise.disconnect();
          } catch {}
        }
      });
    } catch {}
  }

  public stopAllAmbience() {
    this.activeAmbiences.forEach((amb) => amb.stop());
    this.activeAmbiences.clear();
  }

  /**
   * 尖叫鸡惨叫声 (纯程序合成魔性滑音)
   */
  public playChickenSquawk() {
    if (this.isMuted) return;
    try {
      this.init();
      if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(380, now);
      osc.frequency.linearRampToValueAtTime(1100, now + 0.35);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.85);

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.8, now + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.95);
    } catch {}
  }

  /**
   * 赛博香槟开瓶喷涌声
   */
  public playChampagnePop() {
    if (this.isMuted) return;
    try {
      this.init();
      if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);
      gain.gain.setValueAtTime(0.9, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.15);

      const bufferSize = Math.floor(this.ctx.sampleRate * 0.8);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 3500;
      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.4, now + 0.05);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.masterGain);
      noise.start(now + 0.05);
      noise.stop(now + 0.85);
    } catch {}
  }
}

export const SoundFX = new SoundFXEngine();
