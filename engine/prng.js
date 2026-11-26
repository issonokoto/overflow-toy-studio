// Deterministic PRNG (Mulberry32) and math helpers for reproducible runs.

export const WORLD_W = 1080;
export const WORLD_H = 1920;

export class PRNG {
  constructor(seed = Date.now() >>> 0) {
    this.seed = seed >>> 0;
    this.state = this.seed;
  }

  next() {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min, max) {
    return min + (max - min) * this.next();
  }

  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }

  sign() {
    return this.next() < 0.5 ? -1 : 1;
  }
}

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function hsla(h, s, l, a = 1) {
  const hue = ((h % 360) + 360) % 360;
  return `hsla(${hue.toFixed(1)}, ${s}%, ${l}%, ${a})`;
}
