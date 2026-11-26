// Procedural Infinite Board Generator (6 Distinct Silhouette Archetypes):
// Guarantees deadlock-free clearances, bottom-up packing into fixed exit sieve,
// varied neon themes & musical scales, and seamless compatibility with Editor + Storage!

import { WORLD_W, clamp, PRNG } from './prng.js';
import {
  HOPPER_CHUTE_BOT_Y,
  FIXED_EXIT_Y,
  FIXED_LEFT_EXIT_X,
  FIXED_RIGHT_EXIT_X,
  smoothChaikin,
  simplifyRDP,
  autoFillPins,
  distPointToSegment,
} from './boardDesign.js';

const NEON_THEMES = [
  {
    tag: 'CYBER',
    bgTop: '#040919', bgBottom: '#0b1430', bgAura: 'rgba(56, 189, 248, 0.17)',
    grid: 'rgba(56, 189, 248, 0.055)', wall: '#38bdf8', wallGlow: '#0284c7',
    pin: '#e2e8f0', pinHit: '#fde047', bumper: '#ff2e63', spinner: '#c084fc',
    catcher: '#22d3ee', catcherHit: '#4ade80', danger: '#ff2e63', accent: '#38bdf8',
    ballHueStart: 185, ballHueStep: 11, scale: 'pentatonic',
  },
  {
    tag: 'SAKURA',
    bgTop: '#160516', bgBottom: '#290b28', bgAura: 'rgba(244, 114, 182, 0.18)',
    grid: 'rgba(244, 114, 182, 0.06)', wall: '#f472b6', wallGlow: '#db2777',
    pin: '#fdf2f8', pinHit: '#38bdf8', bumper: '#fbbf24', spinner: '#a78bfa',
    catcher: '#38bdf8', catcherHit: '#f472b6', danger: '#ff2e63', accent: '#f472b6',
    ballHueStart: 320, ballHueStep: 13, scale: 'lydian',
  },
  {
    tag: 'EMERALD',
    bgTop: '#031511', bgBottom: '#082722', bgAura: 'rgba(52, 211, 153, 0.17)',
    grid: 'rgba(52, 211, 153, 0.06)', wall: '#34d399', wallGlow: '#059669',
    pin: '#ecfdf5', pinHit: '#fde047', bumper: '#fb7185', spinner: '#38bdf8',
    catcher: '#fde047', catcherHit: '#34d399', danger: '#ff2e63', accent: '#34d399',
    ballHueStart: 145, ballHueStep: 10, scale: 'pentatonic',
  },
  {
    tag: 'SOLAR',
    bgTop: '#170804', bgBottom: '#291009', bgAura: 'rgba(251, 146, 60, 0.18)',
    grid: 'rgba(251, 146, 60, 0.06)', wall: '#fb923c', wallGlow: '#ea580c',
    pin: '#fffbeb', pinHit: '#38bdf8', bumper: '#f43f5e', spinner: '#fde047',
    catcher: '#2dd4bf', catcherHit: '#fbbf24', danger: '#ff2e63', accent: '#fb923c',
    ballHueStart: 18, ballHueStep: 12, scale: 'minor',
  },
  {
    tag: 'VIOLET',
    bgTop: '#0c051d', bgBottom: '#1c0c3b', bgAura: 'rgba(167, 139, 250, 0.18)',
    grid: 'rgba(167, 139, 250, 0.06)', wall: '#a78bfa', wallGlow: '#7c3aed',
    pin: '#f5f3ff', pinHit: '#fde047', bumper: '#ff2e63', spinner: '#22d3ee',
    catcher: '#fde047', catcherHit: '#c084fc', danger: '#ff2e63', accent: '#a78bfa',
    ballHueStart: 265, ballHueStep: 14, scale: 'lydian',
  },
  {
    tag: 'AURORA',
    bgTop: '#04111c', bgBottom: '#0a1f28', bgAura: 'rgba(45, 212, 191, 0.18)',
    grid: 'rgba(45, 212, 191, 0.06)', wall: '#2dd4bf', wallGlow: '#0d9488',
    pin: '#f0fdfa', pinHit: '#f472b6', bumper: '#fb923c', spinner: '#e879f9',
    catcher: '#e879f9', catcherHit: '#2dd4bf', danger: '#ff2e63', accent: '#2dd4bf',
    ballHueStart: 168, ballHueStep: 15, scale: 'lydian',
  },
  {
    tag: 'CRIMSON',
    bgTop: '#16040b', bgBottom: '#290714', bgAura: 'rgba(251, 113, 133, 0.18)',
    grid: 'rgba(251, 113, 133, 0.06)', wall: '#fb7185', wallGlow: '#e11d48',
    pin: '#fff1f2', pinHit: '#22d3ee', bumper: '#facc15', spinner: '#38bdf8',
    catcher: '#22d3ee', catcherHit: '#fb7185', danger: '#ff2e63', accent: '#fb7185',
    ballHueStart: 345, ballHueStep: 12, scale: 'minor',
  },
  {
    tag: 'GOLD',
    bgTop: '#060c1f', bgBottom: '#13162b', bgAura: 'rgba(250, 204, 21, 0.16)',
    grid: 'rgba(250, 204, 21, 0.055)', wall: '#facc15', wallGlow: '#ca8a04',
    pin: '#fefce8', pinHit: '#38bdf8', bumper: '#f43f5e', spinner: '#38bdf8',
    catcher: '#38bdf8', catcherHit: '#facc15', danger: '#ff2e63', accent: '#facc15',
    ballHueStart: 42, ballHueStep: 11, scale: 'pentatonic',
  },
  {
    tag: 'PLASMA',
    bgTop: '#07091e', bgBottom: '#180c2e', bgAura: 'rgba(96, 165, 250, 0.18)',
    grid: 'rgba(96, 165, 250, 0.06)', wall: '#60a5fa', wallGlow: '#2563eb',
    pin: '#eff6ff', pinHit: '#f472b6', bumper: '#e879f9', spinner: '#4ade80',
    catcher: '#4ade80', catcherHit: '#60a5fa', danger: '#ff2e63', accent: '#60a5fa',
    ballHueStart: 215, ballHueStep: 14, scale: 'pentatonic',
  },
  {
    tag: 'ACID',
    bgTop: '#06120c', bgBottom: '#0c1f1a', bgAura: 'rgba(163, 230, 53, 0.17)',
    grid: 'rgba(163, 230, 53, 0.06)', wall: '#a3e635', wallGlow: '#65a30d',
    pin: '#f7fee7', pinHit: '#38bdf8', bumper: '#ff2e63', spinner: '#facc15',
    catcher: '#38bdf8', catcherHit: '#a3e635', danger: '#ff2e63', accent: '#a3e635',
    ballHueStart: 85, ballHueStep: 13, scale: 'minor',
  },
];

const ARCHETYPES = {
  wave: { label: 'WAVE', subtitle: '自動生成・波打つ曲線ボトル' },
  slalom: { label: 'SLALOM', subtitle: '自動生成・左右蛇行スラローム' },
  island: { label: 'ISLAND', subtitle: '自動生成・非対称アイランド' },
  crystal: { label: 'CRYSTAL', subtitle: '自動生成・中央島クリスタル' },
  chambers: { label: 'CHAMBERS', subtitle: '自動生成・多段くびれチャンバー' },
  arena: { label: 'ARENA', subtitle: '自動生成・バンパー＆回転バー祭り' },
};

// Filter groups exposed in UI dropdown
const FILTER_POOLS = {
  any: ['wave', 'slalom', 'island', 'crystal', 'chambers', 'arena'],
  symmetric: ['wave', 'crystal', 'chambers'],
  organic: ['slalom', 'island'],
  gimmick: ['arena', 'crystal', 'wave'],
};

function samplePolylineX(pts, y) {
  if (y <= pts[0].y) return pts[0].x;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (y >= a.y && y <= b.y) {
      const t = (y - a.y) / Math.max(1e-5, b.y - a.y);
      return a.x + (b.x - a.x) * t;
    }
  }
  return pts[pts.length - 1].x;
}

function buildWallCurve(ySamples, fnLeft, fnRight, startCenterX, startWidth) {
  const startL = startCenterX - startWidth * 0.5;
  const startR = startCenterX + startWidth * 0.5;

  const leftRaw = [{ x: startL, y: HOPPER_CHUTE_BOT_Y }];
  const rightRaw = [{ x: startR, y: HOPPER_CHUTE_BOT_Y }];

  for (let i = 0; i < ySamples.length; i++) {
    const y = ySamples[i];
    const t = (y - HOPPER_CHUTE_BOT_Y) / (FIXED_EXIT_Y - HOPPER_CHUTE_BOT_Y);

    let lx = fnLeft(t, y);
    let rx = fnRight(t, y);

    // Smoothly blend top into START mouth and bottom into FIXED exit tips
    const topBlend = Math.pow(clamp(t / 0.14, 0, 1), 1.4);
    const botBlend = Math.pow(clamp((1 - t) / 0.14, 0, 1), 1.4);

    if (t < 0.14) {
      lx = startL + (lx - startL) * topBlend;
      rx = startR + (rx - startR) * topBlend;
    }
    if (t > 0.86) {
      lx = FIXED_LEFT_EXIT_X + (lx - FIXED_LEFT_EXIT_X) * botBlend;
      rx = FIXED_RIGHT_EXIT_X + (rx - FIXED_RIGHT_EXIT_X) * botBlend;
    }

    // Enforce minimum safe inner corridor width (>= 270px) so single balls NEVER choke!
    lx = clamp(lx, 36, WORLD_W - 310);
    rx = clamp(rx, 310, WORLD_W - 36);
    if (rx - lx < 270) {
      const mid = clamp((lx + rx) * 0.5, 175, WORLD_W - 175);
      lx = mid - 135;
      rx = mid + 135;
    }

    leftRaw.push({ x: lx, y });
    rightRaw.push({ x: rx, y });
  }

  leftRaw.push({ x: FIXED_LEFT_EXIT_X, y: FIXED_EXIT_Y });
  rightRaw.push({ x: FIXED_RIGHT_EXIT_X, y: FIXED_EXIT_Y });

  const leftSmooth = simplifyRDP(smoothChaikin(leftRaw, 2, false), 6.5);
  const rightSmooth = simplifyRDP(smoothChaikin(rightRaw, 2, false), 6.5);

  // Pin exact endpoints to START chute and fixed exit sieve
  leftSmooth[0] = { x: startL, y: HOPPER_CHUTE_BOT_Y };
  leftSmooth[leftSmooth.length - 1] = { x: FIXED_LEFT_EXIT_X, y: FIXED_EXIT_Y };
  rightSmooth[0] = { x: startR, y: HOPPER_CHUTE_BOT_Y };
  rightSmooth[rightSmooth.length - 1] = { x: FIXED_RIGHT_EXIT_X, y: FIXED_EXIT_Y };

  return { leftSmooth, rightSmooth };
}

export function generateRandomBoard({
  basePattern,
  filter = 'any',
  seed = null,
} = {}) {
  const actualSeed =
    seed !== null && seed !== undefined
      ? (Number(seed) >>> 0)
      : ((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0);
  const prng = new PRNG(actualSeed);

  const pool = FILTER_POOLS[filter] || FILTER_POOLS.any;
  const archetype = pool[prng.int(0, pool.length - 1)];
  const meta = ARCHETYPES[archetype];
  const theme = NEON_THEMES[prng.int(0, NEON_THEMES.length - 1)];

  const ySamples = [];
  for (let y = 270; y <= 1525; y += 68) ySamples.push(y);

  let startCenterX = WORLD_W * 0.5;
  const startWidth = prng.int(272, 316);
  let fnLeft, fnRight;

  if (archetype === 'wave') {
    const cycles = prng.range(1.3, 2.6);
    const phase = prng.range(0, Math.PI);
    const amp = prng.range(85, 175);
    const baseHalf = prng.range(320, 415);
    fnLeft = (t) => WORLD_W * 0.5 - clamp(baseHalf + Math.sin(t * Math.PI * cycles + phase) * amp, 185, 502);
    fnRight = (t) => WORLD_W * 0.5 + clamp(baseHalf + Math.sin(t * Math.PI * cycles + phase) * amp, 185, 502);
  } else if (archetype === 'slalom') {
    const dir = prng.sign();
    startCenterX = clamp(WORLD_W * 0.5 - dir * prng.range(120, 210), 270, WORLD_W - 270);
    const bends = prng.range(1.6, 2.4);
    const sway = prng.range(145, 225);
    const halfW = prng.range(230, 305);
    fnLeft = (t) => {
      const center = WORLD_W * 0.5 + dir * Math.sin(t * Math.PI * bends - 0.6) * sway;
      return center - halfW * (0.88 + 0.24 * Math.sin(t * Math.PI));
    };
    fnRight = (t) => {
      const center = WORLD_W * 0.5 + dir * Math.sin(t * Math.PI * bends - 0.6) * sway;
      return center + halfW * (0.88 + 0.24 * Math.sin(t * Math.PI));
    };
  } else if (archetype === 'island') {
    // Organic asymmetric silhouette (inspired by Nauru Island!)
    const dir = prng.sign();
    startCenterX = clamp(WORLD_W * 0.5 + dir * prng.range(85, 190), 270, WORLD_W - 270);
    const p1 = prng.range(0, Math.PI * 2);
    const p2 = prng.range(0, Math.PI * 2);
    const f1 = prng.range(1.1, 2.2);
    const f2 = prng.range(1.4, 2.7);
    const lean = dir * prng.range(90, 175);
    fnLeft = (t) => {
      const bulge = Math.sin(t * Math.PI) * 340;
      const organic = Math.sin(t * Math.PI * f1 + p1) * 95;
      const shift = lean * (1 - t * 1.45);
      return WORLD_W * 0.5 + shift - 140 - bulge - organic;
    };
    fnRight = (t) => {
      const bulge = Math.sin(t * Math.PI) * 320;
      const organic = Math.cos(t * Math.PI * f2 + p2) * 90;
      const shift = lean * (1 - t * 1.45);
      return WORLD_W * 0.5 + shift + 140 + bulge + organic;
    };
  } else if (archetype === 'crystal') {
    const peakT = prng.range(0.38, 0.64);
    const maxHalf = prng.range(455, 500);
    fnLeft = (t) => {
      const env = t < peakT ? t / peakT : (1 - t) / (1 - peakT);
      const hw = 165 + Math.pow(clamp(env, 0, 1), 0.72) * (maxHalf - 165);
      return WORLD_W * 0.5 - hw;
    };
    fnRight = (t) => {
      const env = t < peakT ? t / peakT : (1 - t) / (1 - peakT);
      const hw = 165 + Math.pow(clamp(env, 0, 1), 0.72) * (maxHalf - 165);
      return WORLD_W * 0.5 + hw;
    };
  } else if (archetype === 'chambers') {
    const rooms = prng.int(2, 3);
    const minHalf = prng.range(148, 182);
    const maxHalf = prng.range(410, 485);
    fnLeft = (t) => {
      const wave = 0.5 - 0.5 * Math.cos(t * Math.PI * 2 * rooms);
      const hw = minHalf + wave * (maxHalf - minHalf);
      return WORLD_W * 0.5 - hw;
    };
    fnRight = (t) => {
      const wave = 0.5 - 0.5 * Math.cos(t * Math.PI * 2 * rooms);
      const hw = minHalf + wave * (maxHalf - minHalf);
      return WORLD_W * 0.5 + hw;
    };
  } else {
    // Wide arcade arena
    const shoulder = prng.range(0.22, 0.35);
    fnLeft = (t) => {
      const s = clamp(t / shoulder, 0, 1);
      return WORLD_W * 0.5 - (165 + Math.pow(s, 0.65) * 335);
    };
    fnRight = (t) => {
      const s = clamp(t / shoulder, 0, 1);
      return WORLD_W * 0.5 + (165 + Math.pow(s, 0.65) * 335);
    };
  }

  const { leftSmooth, rightSmooth } = buildWallCurve(
    ySamples,
    fnLeft,
    fnRight,
    startCenterX,
    startWidth
  );

  const polylines = [
    { id: 1, thickness: 12, restitution: 0.44, points: leftSmooth },
    { id: 2, thickness: 12, restitution: 0.44, points: rightSmooth },
  ];

  // Optional central deflector / diamond island inside wide boards (guaranteed >= 150px side passages!)
  if (archetype === 'crystal' || (archetype === 'arena' && prng.next() < 0.5)) {
    const islandY = prng.range(720, 980);
    const lx = samplePolylineX(leftSmooth, islandY);
    const rx = samplePolylineX(rightSmooth, islandY);
    const span = rx - lx;
    if (span >= 680) {
      const midX = (lx + rx) * 0.5;
      const w = clamp(prng.range(100, 165), 95, span * 0.24);
      const h = prng.range(95, 145);
      // Inverted-V / diamond roof splits ball traffic cleanly to both sides without trapping balls on top
      polylines.push({
        id: 3,
        thickness: 12,
        restitution: 0.55,
        points: [
          { x: midX - w, y: islandY + h * 0.45 },
          { x: midX, y: islandY - h * 0.55 },
          { x: midX + w, y: islandY + h * 0.45 },
        ],
      });
    }
  }

  // Helper: check distance to all walls
  const minWallDist = (x, y) => {
    let best = Infinity;
    for (const pl of polylines) {
      for (let i = 0; i < pl.points.length - 1; i++) {
        const a = pl.points[i];
        const b = pl.points[i + 1];
        const d = distPointToSegment(x, y, a.x, a.y, b.x, b.y);
        if (d < best) best = d;
      }
    }
    return best;
  };

  // --- Place rotating spinners in safe open pockets ---
  const spinners = [];
  const wantsSpinners =
    filter === 'gimmick' || archetype === 'arena'
      ? prng.int(2, 3)
      : prng.next() < 0.55
        ? prng.int(1, 2)
        : 0;

  let nextSpId = 1;
  for (let attempt = 0; attempt < 24 && spinners.length < wantsSpinners; attempt++) {
    const sy = prng.range(620, 1260);
    const lx = samplePolylineX(leftSmooth, sy);
    const rx = samplePolylineX(rightSmooth, sy);
    const span = rx - lx;
    const len = prng.range(175, 205);

    // Symmetric pair if very wide, else single centered spinner
    if (span >= len * 2 + 230 && spinners.length + 2 <= wantsSpinners) {
      const mid = (lx + rx) * 0.5;
      const off = len * 0.5 + 78;
      const x1 = mid - off;
      const x2 = mid + off;
      const ok1 = minWallDist(x1, sy) >= len * 0.5 + 62;
      const ok2 = minWallDist(x2, sy) >= len * 0.5 + 62;
      const clearOther = spinners.every(
        (s) => Math.hypot(s.x - x1, s.y - sy) > 230 && Math.hypot(s.x - x2, s.y - sy) > 230
      );
      if (ok1 && ok2 && clearOther) {
        const omega = prng.range(2.2, 3.1) * prng.sign();
        spinners.push(
          { id: nextSpId++, x: Math.round(x1), y: Math.round(sy), length: Math.round(len), thickness: 14, angle: 0.3, omega, restitution: 0.76 },
          { id: nextSpId++, x: Math.round(x2), y: Math.round(sy), length: Math.round(len), thickness: 14, angle: -0.3, omega: -omega, restitution: 0.76 }
        );
      }
    } else if (span >= len + 185) {
      const sx = (lx + rx) * 0.5 + prng.range(-40, 40);
      const ok = minWallDist(sx, sy) >= len * 0.5 + 68;
      const clearOther = spinners.every((s) => Math.hypot(s.x - sx, s.y - sy) > 235);
      if (ok && clearOther) {
        spinners.push({
          id: nextSpId++,
          x: Math.round(sx),
          y: Math.round(sy),
          length: Math.round(len),
          thickness: 14,
          angle: prng.range(0, Math.PI),
          omega: prng.range(2.2, 3.1) * prng.sign(),
          restitution: 0.76,
        });
      }
    }
  }

  // --- Place high-rebound neon bumpers safely inside the board ---
  const bumpers = [];
  const wantsBumpers =
    filter === 'gimmick' || archetype === 'arena'
      ? prng.int(3, 5)
      : prng.next() < 0.75
        ? prng.int(1, 3)
        : 0;

  let nextPinId = 1;
  for (let attempt = 0; attempt < 40 && bumpers.length < wantsBumpers; attempt++) {
    const by = prng.range(500, 1340);
    const lx = samplePolylineX(leftSmooth, by);
    const rx = samplePolylineX(rightSmooth, by);
    if (rx - lx < 320) continue;
    const br = prng.int(26, 34);
    const bx = prng.range(lx + br + 105, rx - br - 105);

    const wallClear = minWallDist(bx, by) >= br + 95;
    const spClear = spinners.every((s) => Math.hypot(s.x - bx, s.y - by) >= s.length * 0.5 + br + 68);
    const bmClear = bumpers.every((b) => Math.hypot(b.x - bx, b.y - by) >= b.r + br + 95);
    if (wallClear && spClear && bmClear) {
      bumpers.push({ id: nextPinId++, x: Math.round(bx), y: Math.round(by), r: br, kind: 'bumper' });
    }
  }

  // Assemble editable BoardDesign
  const codeNum = (actualSeed % 9000) + 1000;
  const design = {
    id: `gen_${actualSeed}`,
    name: `${theme.tag} ${meta.label} #${codeNum}`,
    subtitle: meta.subtitle,
    basePatternId: basePattern.id,
    theme,
    catcherMotion: prng.next() < 0.45 ? 'sine' : 'pingpong',
    startCenterX,
    startWidth,
    bottomExit: {
      leftExitX: FIXED_LEFT_EXIT_X,
      rightExitX: FIXED_RIGHT_EXIT_X,
      exitY: FIXED_EXIT_Y,
      slots: 8,
      rowGap: 76,
      pinRadius: 10,
      enabled: true,
      includeLedges: false,
    },
    polylines,
    pins: bumpers,
    spinners,
  };

  // Auto-fill safe interior normal pins (preserving placed bumpers & spinners)
  const pinStyles = ['staggered', 'staggered', 'grid', 'random'];
  const pinStyle = pinStyles[prng.int(0, pinStyles.length - 1)];
  const pinSpacing = prng.int(104, 136);
  autoFillPins(design, {
    style: pinStyle,
    spacing: pinSpacing,
    pinRadius: 10,
    ballRadius: 21,
    keepBumpers: true,
    seed: actualSeed + 77,
  });

  return { design, archetype, theme, seed: actualSeed };
}
