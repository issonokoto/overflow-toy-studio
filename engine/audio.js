// Procedural Web Audio synthesizer with musical scales, polyphony limiter,
// master compressor, and MediaStream destination for synchronized video recording.

import { clamp } from './prng.js';

const SCALES = {
  // C major pentatonic across 3 octaves (never dissonant, bright & joyful)
  pentatonic: [
    261.63, 293.66, 329.63, 392.0, 440.0,
    523.25, 587.33, 659.25, 783.99, 880.0,
    1046.5, 1174.66, 1318.51, 1567.98, 1760.0,
  ],
  // Lydian neon sparkle (dreamy cyber vibe)
  lydian: [
    261.63, 293.66, 329.63, 369.99, 392.0, 440.0, 493.88,
    523.25, 587.33, 659.25, 739.99, 783.99, 880.0, 987.77,
    1046.5,
  ],
  // Minor pentatonic (intense arcade vibe)
  minor: [
    220.0, 261.63, 293.66, 329.63, 392.0,
    440.0, 523.25, 587.33, 659.25, 783.99,
    880.0, 1046.5, 1174.66, 1318.51, 1567.98,
  ],
};

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.compressor = null;
    this.streamDest = null;

    this.muted = false;
    this.scaleName = 'pentatonic';
    this.activeVoices = 0;
    this.maxVoices = 32;
    this.lastPinSoundTime = 0;
    this.lastCatchSoundTime = 0;
    this.catchCombo = 0;
  }

  ensureContext() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return true;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return false;

    this.ctx = new AudioCtx();
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -14;
    this.compressor.knee.value = 18;
    this.compressor.ratio.value = 6;
    this.compressor.attack.value = 0.004;
    this.compressor.release.value = 0.12;

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : 0.72;

    this.streamDest = this.ctx.createMediaStreamDestination();

    this.compressor.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);
    this.masterGain.connect(this.streamDest);
    return true;
  }

  getAudioStream() {
    this.ensureContext();
    return this.streamDest ? this.streamDest.stream : null;
  }

  setScale(name) {
    this.scaleName = SCALES[name] ? name : 'pentatonic';
  }

  setMuted(muted) {
    this.muted = !!muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.muted ? 0 : 0.72, this.ctx.currentTime, 0.02);
    }
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  playPinHit(xNorm, yNorm, impact, isBumper = false) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    // Rate-limit dense collisions so 200 balls stay musical
    const minInterval = isBumper ? 0.015 : 0.022;
    if (now - this.lastPinSoundTime < minInterval || this.activeVoices >= this.maxVoices) return;
    this.lastPinSoundTime = now;

    const scale = SCALES[this.scaleName] || SCALES.pentatonic;
    // Map X and depth to note index for pleasing melodic cascades
    const idxFloat = clamp(xNorm * 0.6 + (1 - yNorm) * 0.4, 0, 0.999) * scale.length;
    const freq = scale[Math.floor(idxFloat)];
    const gainAmt = clamp(impact / 750, 0.06, isBumper ? 0.24 : 0.14);

    this.activeVoices++;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = isBumper ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(isBumper ? freq * 0.5 : freq, now);
    if (isBumper) {
      osc.frequency.exponentialRampToValueAtTime(freq * 1.25, now + 0.06);
    }

    const dur = isBumper ? 0.18 : 0.11;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(gainAmt, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc.connect(gain);
    gain.connect(this.compressor);

    osc.start(now);
    osc.stop(now + dur + 0.01);
    osc.onended = () => {
      this.activeVoices = Math.max(0, this.activeVoices - 1);
    };
  }

  playCatch(ballCount) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (now - this.lastCatchSoundTime < 0.035) return;
    if (now - this.lastCatchSoundTime < 0.7) {
      this.catchCombo = Math.min(this.catchCombo + 1, 10);
    } else {
      this.catchCombo = 0;
    }
    this.lastCatchSoundTime = now;

    const scale = SCALES[this.scaleName] || SCALES.pentatonic;
    const baseIdx = Math.min(scale.length - 3, 4 + Math.floor(this.catchCombo * 0.7));
    const notes = [scale[baseIdx], scale[Math.min(scale.length - 1, baseIdx + 2)], scale[Math.min(scale.length - 1, baseIdx + 4)]];

    // Punchy sub-bass thump on catch
    if (this.activeVoices < this.maxVoices + 6) {
      this.activeVoices++;
      const sub = this.ctx.createOscillator();
      const subGain = this.ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(145, now);
      sub.frequency.exponentialRampToValueAtTime(48, now + 0.14);
      subGain.gain.setValueAtTime(0.0001, now);
      subGain.gain.linearRampToValueAtTime(0.28, now + 0.008);
      subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.17);
      sub.connect(subGain);
      subGain.connect(this.compressor);
      sub.start(now);
      sub.stop(now + 0.18);
      sub.onended = () => {
        this.activeVoices = Math.max(0, this.activeVoices - 1);
      };
    }

    notes.forEach((freq, i) => {
      if (this.activeVoices >= this.maxVoices + 6) return;
      this.activeVoices++;
      const t0 = now + i * 0.036;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = i === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.02, t0 + 0.22);

      const peak = ballCount > 40 ? 0.19 : 0.26;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(peak, t0 + 0.007);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);

      osc.connect(gain);
      gain.connect(this.compressor);
      osc.start(t0);
      osc.stop(t0 + 0.3);
      osc.onended = () => {
        this.activeVoices = Math.max(0, this.activeVoices - 1);
      };
    });
  }

  playRimClink() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (this.activeVoices >= this.maxVoices) return;
    this.activeVoices++;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1420, now);
    osc.frequency.exponentialRampToValueAtTime(680, now + 0.05);

    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);

    osc.connect(gain);
    gain.connect(this.compressor);
    osc.start(now);
    osc.stop(now + 0.07);
    osc.onended = () => {
      this.activeVoices = Math.max(0, this.activeVoices - 1);
    };
  }

  playOverflowFinish() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    // Dramatic celebratory power chord + sub drop
    const chord = [130.81, 261.63, 329.63, 392.0, 523.25, 783.99];
    chord.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = i === 0 ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.025);
      osc.frequency.exponentialRampToValueAtTime(freq * (i === 0 ? 0.5 : 1.005), now + 1.3);

      gain.gain.setValueAtTime(0.0001, now + i * 0.025);
      gain.gain.linearRampToValueAtTime(i === 0 ? 0.22 : 0.14, now + i * 0.025 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.45);

      osc.connect(gain);
      gain.connect(this.compressor);
      osc.start(now + i * 0.025);
      osc.stop(now + 1.5);
    });
  }
}
