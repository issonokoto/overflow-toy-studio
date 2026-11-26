// Pattern 1: CLASSIC OVERFLOW (Bottom-Up Packing Edition)
// Wide top START hopper so balls never choke early at the top;
// bottom granular sieve + gentle lower ledges cause balls to pack densely from the bottom up
// until the entire mountain fills to the brim and spills out of START!

import { WORLD_W } from '../engine/prng.js';
import { addMirroredPolyline, generateBoundedPinRows, generateBottomSievePins } from './helpers.js';

export const classicPattern = {
  id: 'classic',
  shortcut: '1',
  name: 'CLASSIC OVERFLOW',
  subtitle: '下からぎゅうぎゅうに積み上がる王道山型',
  theme: {
    bgTop: '#040817',
    bgBottom: '#0b1128',
    bgAura: 'rgba(56, 189, 248, 0.16)',
    grid: 'rgba(56, 189, 248, 0.055)',
    wall: '#38bdf8',
    wallGlow: '#0284c7',
    pin: '#e2e8f0',
    pinHit: '#fde047',
    bumper: '#f43f5e',
    spinner: '#c084fc',
    catcher: '#22d3ee',
    catcherHit: '#4ade80',
    danger: '#ff2e63',
    accent: '#38bdf8',
    ballHueStart: 185,
    ballHueStep: 9,
    scale: 'pentatonic',
  },
  physics: {
    gravity: 2720,
    ballRadius: 21,
    ballRestitution: 0.44,
    pinRestitution: 0.56,
    wallRestitution: 0.42,
    bumperRestitution: 0.94,
    catcherRestitution: 0.36,
    friction: 0.015,
    airDrag: 0.0004,
    maxSpeed: 2450,
    substeps: 6,
    jamJitter: 30,
  },
  spawn: {
    // Extra-wide START opening so balls never jam at the top until packed solid from the bottom!
    xMin: 416,
    xMax: 664,
    yMin: 164,
    yMax: 220,
    overflowLineY: 128,
    hopperLeftX: 388,
    hopperRightX: 692,
    hopperTopY: 128,
    overflowHoldSeconds: 2.0,
    initialBalls: 1,
    catchBonus: 1,
  },
  catcher: {
    y: 1756,
    width: 320,
    height: 86,
    wallThickness: 12,
    minX: 190,
    maxX: WORLD_W - 190,
    speed: 455,
    motion: 'pingpong',
  },

  buildLayout(prng) {
    const walls = [];

    // Extra-wide START chute -> sweeping mountain curve -> bottom funnel shelves
    const leftProfile = [
      [388, 128],
      [388, 215],
      [326, 335],
      [238, 510],
      [138, 720],
      [58, 935],
      [36, 1080],
      [36, 1465],
      [246, 1590],
    ];
    addMirroredPolyline(walls, leftProfile, 12, 0.42);

    // Upper & mid staggered pin forest
    const pins = generateBoundedPinRows({
      leftProfile,
      yStart: 385,
      yEnd: 1365,
      rowSpacing: 120,
      colSpacing: 130,
      colSpacingBottom: 104,
      pinRadius: 10,
      wallMargin: 60,
      jitterX: 2.0,
      prng,
    });

    // Precision deadlock-free bottom sieve: all 8 slots are 53.5-57.5px (> 42px ball diameter),
    // zero side-leak gap, guaranteed bottom-up packing!
    const sievePins = generateBottomSievePins({
      leftExitX: 246,
      rightExitX: WORLD_W - 246,
      exitY: 1590,
      slots: 8,
      rowGap: 76,
      pinRadius: 10,
    });
    pins.push(...sievePins);

    return { walls, pins, spinners: [] };
  },
};
