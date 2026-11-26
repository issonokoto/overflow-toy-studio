// Pure geometry & BoardDesign compiler/transformer:
// - Converts preset patterns <-> editable BoardDesign (polylines, pins, spinners, movable START, fixed exit)
// - Chaikin corner smoothing & Ramer-Douglas-Peucker simplification for silky-smooth curved walls
// - Safe interior auto-pin generator (staggered / grid / random) with wall-clearance deadlock guard
// - Image silhouette mask -> smooth contoured walls + auto top/bottom openings

import { WORLD_W, WORLD_H, clamp, PRNG } from './prng.js';
import { generateBottomSievePins } from '../patterns/helpers.js';

export const HOPPER_TOP_Y = 128;
export const HOPPER_CHUTE_BOT_Y = 215;
export const FIXED_EXIT_Y = 1590;
export const FIXED_LEFT_EXIT_X = 246;
export const FIXED_RIGHT_EXIT_X = WORLD_W - 246;

export function cloneDesign(d) {
  return JSON.parse(JSON.stringify(d));
}

export function distPointToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-6) return Math.hypot(px - x1, py - y1);
  const t = clamp(((px - x1) * dx + (py - y1) * dy) / lenSq, 0, 1);
  return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
}

// --- Curve simplification & Chaikin corner smoothing ---

export function simplifyRDP(points, epsilon = 8) {
  if (!points || points.length <= 2) return points ? points.map((p) => ({ ...p })) : [];
  let maxDist = 0;
  let maxIdx = 0;
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const d = distPointToSegment(points[i].x, points[i].y, first.x, first.y, last.x, last.y);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = simplifyRDP(points.slice(0, maxIdx + 1), epsilon);
    const right = simplifyRDP(points.slice(maxIdx), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [{ ...first }, { ...last }];
}

// Chaikin corner-cutting algorithm: preserves endpoints, turns sharp corners into silky curves!
export function smoothChaikin(points, iterations = 1, closed = false) {
  if (!points || points.length < 3) return points ? points.map((p) => ({ ...p })) : [];
  let pts = points.map((p) => ({ x: p.x, y: p.y }));

  for (let it = 0; it < iterations; it++) {
    const next = [];
    if (!closed) {
      next.push({ ...pts[0] });
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        if (i > 0) {
          next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
        }
        if (i < pts.length - 2) {
          next.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
        }
      }
      next.push({ ...pts[pts.length - 1] });
    } else {
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
        next.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
      }
    }
    pts = mergeClosePoints(next, 14);
    if (pts.length > 90) pts = simplifyRDP(pts, 4.5);
  }
  return pts;
}

export function mergeClosePoints(points, minDist = 14) {
  if (!points || points.length <= 2) return points || [];
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = out[out.length - 1];
    if (Math.hypot(points[i].x - prev.x, points[i].y - prev.y) >= minDist) {
      out.push(points[i]);
    }
  }
  const last = points[points.length - 1];
  const prev = out[out.length - 1];
  if (Math.hypot(last.x - prev.x, last.y - prev.y) < minDist * 0.5 && out.length > 1) {
    out[out.length - 1] = last;
  } else {
    out.push(last);
  }
  return out;
}

// Clean & smooth a raw freehand stroke into a gorgeous rounded neon wall
export function smoothFreehandStroke(rawPoints) {
  if (!rawPoints || rawPoints.length < 2) return [];
  const dedup = mergeClosePoints(rawPoints, 10);
  if (dedup.length <= 2) return dedup;
  const simplified = simplifyRDP(dedup, 11);
  if (simplified.length <= 2) return simplified;
  const curved = smoothChaikin(simplified, 2, false);
  return simplifyRDP(curved, 5.5);
}

// --- Convert Preset Pattern <-> Editable BoardDesign ---

// Chain disconnected segments back into clean polylines for editing
function segmentsToPolylines(segments) {
  const polylines = [];
  let current = null;
  let nextId = 1;

  for (const s of segments) {
    // Skip the vertical hopper walls (y: 128..215) since START hopper is generated dynamically
    const isHopperWall =
      Math.abs(s.x1 - s.x2) < 2 &&
      Math.min(s.y1, s.y2) <= HOPPER_TOP_Y + 4 &&
      Math.max(s.y1, s.y2) <= HOPPER_CHUTE_BOT_Y + 6;
    if (isHopperWall) {
      current = null;
      continue;
    }

    if (
      current &&
      Math.hypot(
        current.points[current.points.length - 1].x - s.x1,
        current.points[current.points.length - 1].y - s.y1
      ) < 3
    ) {
      current.points.push({ x: s.x2, y: s.y2 });
    } else {
      current = {
        id: nextId++,
        thickness: s.thickness || 12,
        restitution: s.restitution ?? 0.44,
        points: [
          { x: s.x1, y: s.y1 },
          { x: s.x2, y: s.y2 },
        ],
      };
      polylines.push(current);
    }
  }
  return polylines;
}

export function designFromPattern(pattern) {
  const prng = new PRNG(101);
  const layout = pattern.buildLayout(prng);
  const polylines = segmentsToPolylines(layout.walls || []);

  // Filter out bottom sieve pins (y >= 1500) so fixed bottom exit remains cleanly managed
  const editablePins = (layout.pins || [])
    .filter((p) => p.y < 1490)
    .map((p, idx) => ({
      id: idx + 1,
      x: Math.round(p.x * 10) / 10,
      y: Math.round(p.y * 10) / 10,
      r: p.r || 10,
      kind: p.kind || 'normal',
    }));

  const spinners = (layout.spinners || []).map((sp, idx) => ({
    id: idx + 1,
    x: sp.x,
    y: sp.y,
    length: sp.length || 196,
    thickness: sp.thickness || 14,
    angle: sp.angle ?? 0.3,
    omega: sp.omega ?? 2.5,
    restitution: sp.restitution ?? 0.76,
  }));

  const sp = pattern.spawn;
  const startCenterX = (sp.hopperLeftX + sp.hopperRightX) * 0.5;
  const startWidth = sp.hopperRightX - sp.hopperLeftX;

  return {
    id: pattern.id,
    name: pattern.name,
    basePatternId: pattern.id,
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
      includeLedges: false, // Preset polylines already draw the bottom funnel shelves
    },
    polylines,
    pins: editablePins,
    spinners,
  };
}

export function createBlankDesign(basePattern) {
  return {
    id: `custom_${Date.now()}`,
    name: 'CUSTOM BOARD',
    basePatternId: basePattern.id,
    startCenterX: WORLD_W * 0.5,
    startWidth: 304,
    bottomExit: {
      leftExitX: FIXED_LEFT_EXIT_X,
      rightExitX: FIXED_RIGHT_EXIT_X,
      exitY: FIXED_EXIT_Y,
      slots: 8,
      rowGap: 76,
      pinRadius: 10,
      enabled: true,
      includeLedges: true,
    },
    polylines: [],
    pins: [],
    spinners: [],
  };
}

// Compile editable BoardDesign into a live Pattern object accepted by OverflowSimulation
export function compileDesignToPattern(design, basePattern) {
  const halfW = clamp(design.startWidth || 304, 170, 440) * 0.5;
  const cx = clamp(design.startCenterX ?? WORLD_W * 0.5, halfW + 40, WORLD_W - halfW - 40);
  const hopperLeftX = cx - halfW;
  const hopperRightX = cx + halfW;

  const spawn = {
    ...basePattern.spawn,
    xMin: hopperLeftX + 28,
    xMax: hopperRightX - 28,
    yMin: 164,
    yMax: 220,
    overflowLineY: HOPPER_TOP_Y,
    hopperLeftX,
    hopperRightX,
    hopperTopY: HOPPER_TOP_Y,
  };

  return {
    ...basePattern,
    id: design.id || 'custom',
    name: design.name || 'CUSTOM BOARD',
    subtitle: design.subtitle || 'カスタム編集盤面',
    theme: design.theme ? { ...basePattern.theme, ...design.theme } : basePattern.theme,
    catcher: design.catcherMotion
      ? { ...basePattern.catcher, motion: design.catcherMotion }
      : basePattern.catcher,
    spawn,
    buildLayout() {
      const walls = [];

      // 1. Dynamic START hopper vertical walls (follows horizontal startCenterX!)
      walls.push(
        { x1: hopperLeftX, y1: HOPPER_TOP_Y, x2: hopperLeftX, y2: HOPPER_CHUTE_BOT_Y, thickness: 12, restitution: 0.42, kind: 'hopper' },
        { x1: hopperRightX, y1: HOPPER_TOP_Y, x2: hopperRightX, y2: HOPPER_CHUTE_BOT_Y, thickness: 12, restitution: 0.42, kind: 'hopper' }
      );

      // 2. User-edited polylines
      for (const pl of design.polylines || []) {
        const pts = pl.points || [];
        for (let i = 0; i < pts.length - 1; i++) {
          walls.push({
            x1: pts[i].x,
            y1: pts[i].y,
            x2: pts[i + 1].x,
            y2: pts[i + 1].y,
            thickness: pl.thickness || 12,
            restitution: pl.restitution ?? 0.44,
            kind: 'wall',
          });
        }
      }

      // 3. Optional fixed bottom guiding shelves (used for blank/traced boards so balls funnel to the exit)
      const ex = design.bottomExit || {
        leftExitX: FIXED_LEFT_EXIT_X,
        rightExitX: FIXED_RIGHT_EXIT_X,
        exitY: FIXED_EXIT_Y,
        slots: 8,
        rowGap: 76,
        pinRadius: 10,
        enabled: true,
        includeLedges: false,
      };

      if (ex.includeLedges) {
        walls.push(
          { x1: 36, y1: 1465, x2: ex.leftExitX, y2: ex.exitY, thickness: 12, restitution: 0.42, kind: 'exit' },
          { x1: WORLD_W - 36, y1: 1465, x2: ex.rightExitX, y2: ex.exitY, thickness: 12, restitution: 0.42, kind: 'exit' }
        );
      }

      // 4. User-edited pins + fixed bottom precision sieve pins
      const pins = (design.pins || []).map((p) => ({ ...p }));
      if (ex.enabled !== false) {
        pins.push(
          ...generateBottomSievePins({
            leftExitX: ex.leftExitX,
            rightExitX: ex.rightExitX,
            exitY: ex.exitY,
            slots: ex.slots || 8,
            rowGap: ex.rowGap || 76,
            pinRadius: ex.pinRadius || 10,
          })
        );
      }

      const spinners = (design.spinners || []).map((sp) => ({ ...sp }));
      return { walls, pins, spinners };
    },
  };
}

// --- Auto-fill Pins inside arbitrary custom walls with deadlock safety guard ---

export function autoFillPins(design, {
  style = 'staggered', // 'staggered' | 'grid' | 'random'
  spacing = 114,
  pinRadius = 10,
  ballRadius = 21,
  keepBumpers = true,
  seed = Date.now(),
} = {}) {
  const prng = new PRNG(seed >>> 0);
  const wallSegs = [];
  for (const pl of design.polylines || []) {
    const pts = pl.points || [];
    for (let i = 0; i < pts.length - 1; i++) {
      wallSegs.push({ x1: pts[i].x, y1: pts[i].y, x2: pts[i + 1].x, y2: pts[i + 1].y, t: pl.thickness || 12 });
    }
  }

  const kept = keepBumpers ? (design.pins || []).filter((p) => p.kind === 'bumper') : [];
  const spinners = design.spinners || [];

  // Minimum safe gap from any wall so a single ball can NEVER get pinched between wall & pin!
  const wallSafeDist = ballRadius * 2 + pinRadius + 14;
  const bumperSafeDist = ballRadius * 2 + pinRadius + 18;

  const isSafe = (x, y, existing) => {
    if (x < 68 || x > WORLD_W - 68 || y < 320 || y > 1410) return false;
    for (let i = 0; i < wallSegs.length; i++) {
      const s = wallSegs[i];
      if (distPointToSegment(x, y, s.x1, s.y1, s.x2, s.y2) < wallSafeDist + s.t * 0.5) {
        return false;
      }
    }
    for (let i = 0; i < kept.length; i++) {
      const bm = kept[i];
      if (Math.hypot(x - bm.x, y - bm.y) < bm.r + bumperSafeDist) return false;
    }
    for (let i = 0; i < spinners.length; i++) {
      const sp = spinners[i];
      if (Math.hypot(x - sp.x, y - sp.y) < sp.length * 0.5 + pinRadius + 46) return false;
    }
    for (let i = 0; i < existing.length; i++) {
      const p = existing[i];
      if (Math.hypot(x - p.x, y - p.y) < Math.max(spacing * 0.72, ballRadius * 2 + pinRadius * 2 + 12)) {
        return false;
      }
    }
    return true;
  };

  // Scanline horizontal interior spans at a given Y
  const getSpansAtY = (y) => {
    const xs = [];
    for (let i = 0; i < wallSegs.length; i++) {
      const s = wallSegs[i];
      if ((s.y1 <= y && s.y2 > y) || (s.y2 <= y && s.y1 > y)) {
        const t = (y - s.y1) / (s.y2 - s.y1);
        xs.push(s.x1 + (s.x2 - s.x1) * t);
      }
    }
    xs.sort((a, b) => a - b);
    if (xs.length >= 2) {
      // Pair intersections (even-odd interior spans)
      const spans = [];
      for (let i = 0; i + 1 < xs.length; i += 2) {
        if (xs[i + 1] - xs[i] > wallSafeDist * 1.4) {
          spans.push([xs[i], xs[i + 1]]);
        }
      }
      if (spans.length > 0) return spans;
      return [[xs[0], xs[xs.length - 1]]];
    }
    // Open board fallback: fill central area
    return [[72, WORLD_W - 72]];
  };

  const generated = [];
  let nextId = kept.reduce((m, p) => Math.max(m, p.id || 0), 0) + 1;

  if (style === 'random') {
    const targetCount = Math.floor(1400000 / (spacing * spacing));
    for (let tries = 0; tries < targetCount * 8 && generated.length < targetCount; tries++) {
      const y = prng.range(345, 1395);
      const spans = getSpansAtY(y);
      const span = spans[prng.int(0, spans.length - 1)];
      const x = prng.range(span[0] + wallSafeDist * 0.7, span[1] - wallSafeDist * 0.7);
      if (isSafe(x, y, generated)) {
        generated.push({ id: nextId++, x: Math.round(x), y: Math.round(y), r: pinRadius, kind: 'normal' });
      }
    }
  } else {
    const rowStep = style === 'staggered' ? spacing * 0.92 : spacing;
    let rowIdx = 0;
    for (let y = 365; y <= 1395; y += rowStep) {
      const spans = getSpansAtY(y);
      const offset = style === 'staggered' && rowIdx % 2 === 1 ? spacing * 0.5 : 0;
      for (const [xL, xR] of spans) {
        const cx = WORLD_W * 0.5;
        const kMin = Math.floor((xL - cx) / spacing) - 1;
        const kMax = Math.ceil((xR - cx) / spacing) + 1;
        for (let k = kMin; k <= kMax; k++) {
          const x = cx + k * spacing + offset;
          if (x > xL && x < xR && isSafe(x, y, generated)) {
            generated.push({ id: nextId++, x: Math.round(x), y: Math.round(y), r: pinRadius, kind: 'normal' });
          }
        }
      }
      rowIdx++;
    }
  }

  design.pins = [...kept, ...generated];
  return design.pins.length;
}

// --- Image Silhouette Mask -> Smooth Contoured Walls + Top/Bottom Openings ---

// Traces a binary mask (width W, height H, 1 = inside silhouette) into left & right smooth wall polylines.
export function traceMaskToPolylines(mask, W, H, scaleX, scaleY) {
  // 1. Keep only the largest connected component (ignores dust/speckles)
  const labels = new Int32Array(W * H);
  let bestLabel = 0;
  let bestCount = 0;
  let curLabel = 0;
  const queue = new Int32Array(W * H);

  for (let i = 0; i < W * H; i++) {
    if (mask[i] !== 1 || labels[i] !== 0) continue;
    curLabel++;
    let head = 0;
    let tail = 0;
    queue[tail++] = i;
    labels[i] = curLabel;

    while (head < tail) {
      const idx = queue[head++];
      const x = idx % W;
      const y = (idx - x) / W;
      if (x > 0 && mask[idx - 1] === 1 && labels[idx - 1] === 0) {
        labels[idx - 1] = curLabel;
        queue[tail++] = idx - 1;
      }
      if (x + 1 < W && mask[idx + 1] === 1 && labels[idx + 1] === 0) {
        labels[idx + 1] = curLabel;
        queue[tail++] = idx + 1;
      }
      if (y > 0 && mask[idx - W] === 1 && labels[idx - W] === 0) {
        labels[idx - W] = curLabel;
        queue[tail++] = idx - W;
      }
      if (y + 1 < H && mask[idx + W] === 1 && labels[idx + W] === 0) {
        labels[idx + W] = curLabel;
        queue[tail++] = idx + W;
      }
    }
    if (tail > bestCount) {
      bestCount = tail;
      bestLabel = curLabel;
    }
  }

  if (bestCount < 80) return null;

  // 2. Scan horizontal left/right silhouette bounds per row to get a clean, deadlock-free
  //    plinko-friendly envelope (naturally handles concave/organic character silhouettes!)
  const leftRaw = [];
  const rightRaw = [];
  let minY = H;
  let maxY = 0;

  for (let y = 0; y < H; y++) {
    let lx = -1;
    let rx = -1;
    const rowOff = y * W;
    for (let x = 0; x < W; x++) {
      if (labels[rowOff + x] === bestLabel) {
        if (lx < 0) lx = x;
        rx = x;
      }
    }
    if (lx >= 0 && rx - lx >= 10) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      leftRaw.push({ x: lx * scaleX, y: y * scaleY });
      rightRaw.push({ x: rx * scaleX, y: y * scaleY });
    }
  }

  if (leftRaw.length < 10) return null;

  // Map silhouette vertical range cleanly between START throat (y=215) and bottom exit (y=1585)
  const srcTopY = minY * scaleY;
  const srcBotY = maxY * scaleY;
  const srcH = Math.max(100, srcBotY - srcTopY);

  // Use top 12% center as the aligned START hopper X
  const topSlice = Math.max(3, Math.floor(leftRaw.length * 0.12));
  let topCenterSum = 0;
  for (let i = 0; i < topSlice; i++) {
    topCenterSum += (leftRaw[i].x + rightRaw[i].x) * 0.5;
  }
  const startCenterX = clamp(topCenterSum / topSlice, 220, WORLD_W - 220);
  const startWidth = 280;
  const startL = startCenterX - startWidth * 0.5;
  const startR = startCenterX + startWidth * 0.5;

  // Remap Y smoothly if the image sits outside the playable vertical span
  const targetTop = Math.max(HOPPER_CHUTE_BOT_Y + 12, Math.min(srcTopY, 340));
  const targetBot = Math.min(FIXED_EXIT_Y - 12, Math.max(srcBotY, 1460));
  const remapY = (y) => targetTop + ((y - srcTopY) / srcH) * (targetBot - targetTop);

  // Trim top/bottom caps where the silhouette pinches narrower than the mouth/exit
  const leftBody = [];
  const rightBody = [];
  for (let i = 0; i < leftRaw.length; i++) {
    const frac = i / (leftRaw.length - 1);
    const wy = remapY(leftRaw[i].y);
    const lx = clamp(leftRaw[i].x, 36, WORLD_W - 36);
    const rx = clamp(rightRaw[i].x, 36, WORLD_W - 36);
    if (frac > 0.06 && frac < 0.94 && rx - lx >= 130) {
      leftBody.push({ x: lx, y: wy });
      rightBody.push({ x: rx, y: wy });
    }
  }

  if (leftBody.length < 4) return null;

  const leftChain = [
    { x: startL, y: HOPPER_CHUTE_BOT_Y },
    ...leftBody,
    { x: FIXED_LEFT_EXIT_X, y: FIXED_EXIT_Y },
  ];
  const rightChain = [
    { x: startR, y: HOPPER_CHUTE_BOT_Y },
    ...rightBody,
    { x: FIXED_RIGHT_EXIT_X, y: FIXED_EXIT_Y },
  ];

  // Smooth + simplify into clean, rounded editable polylines!
  const leftSmooth = simplifyRDP(smoothChaikin(simplifyRDP(leftChain, 14), 2, false), 7);
  const rightSmooth = simplifyRDP(smoothChaikin(simplifyRDP(rightChain, 14), 2, false), 7);

  // Pin exact endpoints to START chute and fixed bottom exit tips
  leftSmooth[0] = { x: startL, y: HOPPER_CHUTE_BOT_Y };
  leftSmooth[leftSmooth.length - 1] = { x: FIXED_LEFT_EXIT_X, y: FIXED_EXIT_Y };
  rightSmooth[0] = { x: startR, y: HOPPER_CHUTE_BOT_Y };
  rightSmooth[rightSmooth.length - 1] = { x: FIXED_RIGHT_EXIT_X, y: FIXED_EXIT_Y };

  return {
    startCenterX,
    startWidth,
    polylines: [
      { id: 1, thickness: 12, restitution: 0.44, points: leftSmooth },
      { id: 2, thickness: 12, restitution: 0.44, points: rightSmooth },
    ],
  };
}
