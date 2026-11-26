// Pattern 2: HYPER PINBALL (Bonus Pattern 1 - Single U-Catcher, Bottom-Up Packing)
// Wild bumpers & counter-rotating spinners above a bottom-packing pinball bed!

import { WORLD_W } from '../engine/prng.js';
import { addMirroredPolyline, generateBoundedPinRows, generateBottomSievePins } from './helpers.js';

export const pinballPattern = {
  id: 'pinball',
  shortcut: '2',
  name: 'HYPER PINBALL',
  subtitle: 'バンパー＆回転バーの下からぎゅうぎゅう埋め尽くし',
  theme: {
    bgTop: '#0d041a',
    bgBottom: '#1c0a33',
    bgAura: 'rgba(232, 121, 249, 0.16)',
    grid: 'rgba(232, 121, 249, 0.06)',
    wall: '#e879f9',
    wallGlow: '#a21caf',
    pin: '#f1f5f9',
    pinHit: '#38bdf8',
    bumper: '#ff2e63',
    spinner: '#fde047',
    catcher: '#38bdf8',
    catcherHit: '#fde047',
    danger: '#ff2e63',
    accent: '#e879f9',
    ballHueStart: 295,
    ballHueStep: 11,
    scale: 'lydian',
  },
  physics: {
    gravity: 2740,
    ballRadius: 21,
    ballRestitution: 0.46,
    pinRestitution: 0.6,
    wallRestitution: 0.46,
    bumperRestitution: 0.9,
    catcherRestitution: 0.38,
    friction: 0.014,
    airDrag: 0.0004,
    maxSpeed: 2480,
    substeps: 6,
    jamJitter: 32,
  },
  spawn: {
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
    width: 324,
    height: 86,
    wallThickness: 12,
    minX: 192,
    maxX: WORLD_W - 192,
    speed: 465,
    motion: 'sine',
  },

  buildLayout() {
    const walls = [];
    const leftProfile = [
      [388, 128],
      [388, 215],
      [308, 355],
      [182, 555],
      [58, 815],
      [40, 980],
      [40, 1460],
      [246, 1590],
    ];
    addMirroredPolyline(walls, leftProfile, 12, 0.46);

    const spinners = [
      { x: 335, y: 920, length: 196, thickness: 14, angle: 0.3, omega: 2.5, restitution: 0.76 },
      { x: 745, y: 920, length: 196, thickness: 14, angle: -0.3, omega: -2.5, restitution: 0.76 },
    ];

    const bumpers = [
      { x: 540, y: 650, r: 34, kind: 'bumper' },
      { x: 540, y: 1175, r: 32, kind: 'bumper' },
      { x: 265, y: 1255, r: 26, kind: 'bumper' },
      { x: 815, y: 1255, r: 26, kind: 'bumper' },
    ];

    const rawPins = generateBoundedPinRows({
      leftProfile,
      yStart: 390,
      yEnd: 1355,
      rowSpacing: 124,
      colSpacing: 138,
      colSpacingBottom: 110,
      pinRadius: 10,
      wallMargin: 64,
    });

    const pins = rawPins.filter((p) => {
      for (const bm of bumpers) {
        if (Math.hypot(p.x - bm.x, p.y - bm.y) < bm.r + p.r + 68) return false;
      }
      for (const sp of spinners) {
        if (Math.hypot(p.x - sp.x, p.y - sp.y) < sp.length * 0.5 + p.r + 48) return false;
      }
      return true;
    });

    pins.push(...bumpers);
    pins.push(
      ...generateBottomSievePins({
        leftExitX: 246,
        rightExitX: WORLD_W - 246,
        exitY: 1590,
        slots: 8,
        rowGap: 76,
        pinRadius: 10,
      })
    );

    return { walls, pins, spinners };
  },
};
