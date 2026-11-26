// Helper builders shared by patterns so adding new boards is fast and clean.

import { WORLD_W } from '../engine/prng.js';

export function addPolylineWalls(walls, points, thickness = 12, restitution = 0.48, kind = 'wall') {
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    walls.push({ x1, y1, x2, y2, thickness, restitution, kind });
  }
}

export function addMirroredPolyline(walls, leftPoints, thickness = 12, restitution = 0.48, kind = 'wall') {
  addPolylineWalls(walls, leftPoints, thickness, restitution, kind);
  const rightPoints = leftPoints.map(([x, y]) => [WORLD_W - x, y]);
  addPolylineWalls(walls, rightPoints, thickness, restitution, kind);
}

export function sampleWallX(points, y) {
  if (y <= points[0][1]) return points[0][0];
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    if (y >= y1 && y <= y2) {
      const t = (y - y1) / Math.max(1e-5, y2 - y1);
      return x1 + (x2 - x1) * t;
    }
  }
  return points[points.length - 1][0];
}

// Generate staggered pin rows bounded inside left/right symmetric profile.
// Supports optional bottom-dense gradient so balls flow freely early, then pack bottom-up!
export function generateBoundedPinRows({
  leftProfile,
  yStart,
  yEnd,
  rowSpacing,
  colSpacing,
  colSpacingBottom = null,
  pinRadius = 10,
  wallMargin = 48,
  jitterX = 0,
  prng = null,
}) {
  const pins = [];
  const cx = WORLD_W * 0.5;
  let rowIndex = 0;

  for (let y = yStart; y <= yEnd; y += rowSpacing) {
    const leftBound = sampleWallX(leftProfile, y) + wallMargin;
    const rightBound = WORLD_W - leftBound;
    const usableW = rightBound - leftBound;

    if (usableW < pinRadius * 2.5) {
      rowIndex++;
      continue;
    }

    const t = Math.max(0, Math.min(1, (y - yStart) / Math.max(1, yEnd - yStart)));
    const spacing = colSpacingBottom !== null
      ? colSpacing + (colSpacingBottom - colSpacing) * (t * t)
      : colSpacing;

    const staggered = rowIndex % 2 === 1;
    const maxHalfSteps = Math.floor((usableW * 0.5) / spacing);

    if (!staggered) {
      for (let k = -maxHalfSteps; k <= maxHalfSteps; k++) {
        let x = cx + k * spacing;
        if (jitterX && prng) x += prng.range(-jitterX, jitterX);
        if (x >= leftBound && x <= rightBound) {
          pins.push({ x, y, r: pinRadius, kind: 'normal' });
        }
      }
    } else {
      for (let k = -maxHalfSteps - 1; k <= maxHalfSteps; k++) {
        let x = cx + (k + 0.5) * spacing;
        if (jitterX && prng) x += prng.range(-jitterX, jitterX);
        if (x >= leftBound && x <= rightBound) {
          pins.push({ x, y, r: pinRadius, kind: 'normal' });
        }
      }
    }
    rowIndex++;
  }

  return pins;
}

// Mathematically guaranteed deadlock-free bottom sieve aligned exactly between leftExitX and rightExitX:
// Every gap is > ballDiameter (single balls always pass), while < 2*ballDiameter (traffic packs bottom-up!).
export function generateBottomSievePins({
  leftExitX = 246,
  rightExitX = WORLD_W - 246,
  exitY = 1590,
  slots = 8,
  rowGap = 74,
  pinRadius = 10,
}) {
  const pins = [];
  const pitch = (rightExitX - leftExitX) / slots;

  // Bottom row: aligned exactly with the shelf exit tips (slots - 1 pins)
  for (let k = 1; k < slots; k++) {
    pins.push({ x: leftExitX + pitch * k, y: exitY, r: pinRadius, kind: 'normal' });
  }
  // Upper staggered row well clear of angled side ledges (slots - 2 pins)
  for (let k = 1; k < slots - 1; k++) {
    pins.push({ x: leftExitX + pitch * (k + 0.5), y: exitY - rowGap, r: pinRadius, kind: 'normal' });
  }
  return pins;
}
