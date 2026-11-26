// Pattern 3: NEON HOURGLASS (Bonus Pattern 2 - Single U-Catcher, Bottom-Up Packing)
// Double chamber hourglass: lower chamber packs completely full first, then backs up through
// the glowing waist into the upper chamber until overflowing out the top START!

import { WORLD_W } from '../engine/prng.js';
import { addMirroredPolyline, generateBoundedPinRows, generateBottomSievePins } from './helpers.js';

export const hourglassPattern = {
  id: 'hourglass',
  shortcut: '3',
  name: 'NEON HOURGLASS',
  subtitle: '下室が満タン→くびれ逆流→上室まで満杯になる二段砂時計',
  theme: {
    bgTop: '#070b1a',
    bgBottom: '#160d18',
    bgAura: 'rgba(251, 146, 60, 0.16)',
    grid: 'rgba(251, 146, 60, 0.055)',
    wall: '#fb923c',
    wallGlow: '#ea580c',
    pin: '#fef3c7',
    pinHit: '#2dd4bf',
    bumper: '#f43f5e',
    spinner: '#38bdf8',
    catcher: '#2dd4bf',
    catcherHit: '#fbbf24',
    danger: '#ff2e63',
    accent: '#fb923c',
    ballHueStart: 22,
    ballHueStep: 10,
    scale: 'minor',
  },
  physics: {
    gravity: 2740,
    ballRadius: 21,
    ballRestitution: 0.44,
    pinRestitution: 0.56,
    wallRestitution: 0.4,
    bumperRestitution: 0.9,
    catcherRestitution: 0.36,
    friction: 0.015,
    airDrag: 0.0004,
    maxSpeed: 2480,
    substeps: 6,
    jamJitter: 30,
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
    width: 322,
    height: 86,
    wallThickness: 12,
    minX: 190,
    maxX: WORLD_W - 190,
    speed: 455,
    motion: 'pingpong',
  },

  buildLayout() {
    const walls = [];

    // Extra-wide START -> upper chamber -> generous waist (260px) -> lower chamber -> bottom funnel shelves
    const leftProfile = [
      [388, 128],
      [388, 215],
      [236, 380],
      [122, 535],
      [122, 650],
      [285, 795],
      [410, 895],
      [410, 955],
      [226, 1080],
      [58, 1245],
      [38, 1340],
      [38, 1465],
      [246, 1590],
    ];
    addMirroredPolyline(walls, leftProfile, 12, 0.42);

    const pins = [
      // Mid-waist splitter bumper
      { x: 540, y: 1035, r: 24, kind: 'bumper' },
      ...generateBoundedPinRows({
        leftProfile,
        yStart: 395,
        yEnd: 775,
        rowSpacing: 122,
        colSpacing: 136,
        pinRadius: 10,
        wallMargin: 64,
      }),
      ...generateBoundedPinRows({
        leftProfile,
        yStart: 1155,
        yEnd: 1365,
        rowSpacing: 118,
        colSpacing: 124,
        pinRadius: 10,
        wallMargin: 60,
      }),
      ...generateBottomSievePins({
        leftExitX: 246,
        rightExitX: WORLD_W - 246,
        exitY: 1590,
        slots: 8,
        rowGap: 76,
        pinRadius: 10,
      }),
    ];

    return { walls, pins, spinners: [] };
  },
};
