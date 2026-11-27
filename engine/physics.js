// Custom 2D rigid-body physics engine tailored for high-count Plinko / Pachinko overflow toys.
// Supports: balls (with spatial hash grid), pins/bumpers, thick capsule walls, rotating spinners, and moving U-catcher.

import { WORLD_W, WORLD_H, clamp } from './prng.js';

export class PhysicsWorld {
  constructor(config, prng) {
    this.cfg = { ...config };
    this.prng = prng;

    this.balls = [];
    this.pins = [];      // { id, x, y, r, kind: 'normal'|'bumper', restitution, flash, hitCount }
    this.walls = [];     // { x1, y1, x2, y2, thickness, restitution, kind }
    this.spinners = [];  // { id, x, y, length, thickness, angle, omega, restitution, flash }
    this.catcher = null; // { x, y, width, height, wallThickness, minX, maxX, speed, dir, vx, motion, phase, bounce, hitFlash }

    this.nextBallId = 1;
    this.cellSize = 66;
    this.grid = new Map();
    this.time = 0;
    this.liteMode = false;

    // Events emitted per step for VFX/Audio/Rules
    this.events = {
      pinHits: [],
      spinnerHits: [],
      catcherRimHits: [],
      catches: [],
      misses: [],
    };
  }

  clearEvents() {
    this.events.pinHits.length = 0;
    this.events.spinnerHits.length = 0;
    this.events.catcherRimHits.length = 0;
    this.events.catches.length = 0;
    this.events.misses.length = 0;
  }

  addBall({ x, y, vx = 0, vy = 0, r, hue, generation = 0 }) {
    const ball = {
      id: this.nextBallId++,
      x,
      y,
      vx,
      vy,
      r: r ?? this.cfg.ballRadius,
      hue,
      generation,
      trail: [],
      age: 0,
      escapedHopper: false,
      caught: false,
      missed: false,
      flash: 1.0,
      lastHitPinId: -1,
      lastHitTime: -1,
    };
    this.balls.push(ball);
    return ball;
  }

  getCatcherSegments() {
    const c = this.catcher;
    if (!c) return [];
    const halfW = c.width * 0.5;
    const halfH = c.height * 0.5;
    const yOff = c.bounceOffset || 0;
    const leftX = c.x - halfW;
    const rightX = c.x + halfW;
    const topY = c.y - halfH + yOff;
    const botY = c.y + halfH + yOff;
    const r = c.wallThickness * 0.5;
    const rest = this.cfg.catcherRestitution ?? 0.42;

    return [
      { x1: leftX, y1: topY, x2: leftX, y2: botY, r, rest, vx: c.vx, vy: 0, part: 'left' },
      { x1: rightX, y1: topY, x2: rightX, y2: botY, r, rest, vx: c.vx, vy: 0, part: 'right' },
      { x1: leftX, y1: botY, x2: rightX, y2: botY, r, rest, vx: c.vx, vy: 0, part: 'bottom' },
    ];
  }

  step(dt) {
    this.clearEvents();
    const substeps = this.liteMode
      ? Math.min(4, this.cfg.substeps || 4)
      : (this.cfg.substeps || 6);
    const subDt = dt / substeps;

    for (let s = 0; s < substeps; s++) {
      this.time += subDt;
      this._updateMovingBodies(subDt);
      this._integrateBalls(subDt);
      this._resolveBallCollisions();
      this._resolveEnvironmentCollisions();
      this._checkCatchAndMiss();
    }

    // Update trails & decay visual flashes once per visual frame
    const maxTrail = this.liteMode ? 7 : 26;
    for (let i = 0; i < this.balls.length; i++) {
      const b = this.balls[i];
      b.age += dt;
      if (b.flash > 0) b.flash = Math.max(0, b.flash - dt * 3.2);
      b.trail.push({ x: b.x, y: b.y });
      if (b.trail.length > maxTrail) b.trail.splice(0, b.trail.length - maxTrail);
    }

    for (let i = 0; i < this.pins.length; i++) {
      const p = this.pins[i];
      if (p.flash > 0) p.flash = Math.max(0, p.flash - dt * 3.8);
    }

    for (let i = 0; i < this.spinners.length; i++) {
      const sp = this.spinners[i];
      if (sp.flash > 0) sp.flash = Math.max(0, sp.flash - dt * 4.0);
    }

    if (this.catcher) {
      if (this.catcher.hitFlash > 0) {
        this.catcher.hitFlash = Math.max(0, this.catcher.hitFlash - dt * 3.5);
      }
      // Spring damper for catcher bounce
      const springK = 260;
      const damp = 14;
      const acc = -springK * this.catcher.bounceOffset - damp * this.catcher.bounceVel;
      this.catcher.bounceVel += acc * dt;
      this.catcher.bounceOffset += this.catcher.bounceVel * dt;
    }

    // Remove caught/missed balls after recording events
    if (this.events.catches.length > 0 || this.events.misses.length > 0) {
      this.balls = this.balls.filter((b) => !b.caught && !b.missed);
    }
  }

  _updateMovingBodies(dt) {
    // Rotate spinners
    for (let i = 0; i < this.spinners.length; i++) {
      const sp = this.spinners[i];
      sp.angle += sp.omega * dt;
    }

    // Move U-catcher horizontally
    const c = this.catcher;
    if (!c) return;
    const prevX = c.x;

    if (c.motion === 'sine') {
      const mid = (c.minX + c.maxX) * 0.5;
      const amp = (c.maxX - c.minX) * 0.5;
      const angularFreq = c.speed / Math.max(1, amp);
      c.phase += angularFreq * dt;
      c.x = mid + Math.sin(c.phase) * amp;
    } else {
      // Smooth ping-pong with gentle ease near ends
      c.x += c.dir * c.speed * dt;
      if (c.x >= c.maxX) {
        c.x = c.maxX;
        c.dir = -1;
      } else if (c.x <= c.minX) {
        c.x = c.minX;
        c.dir = 1;
      }
    }

    c.vx = (c.x - prevX) / dt;
  }

  _integrateBalls(dt) {
    const g = this.cfg.gravity;
    const drag = Math.max(0, 1 - (this.cfg.airDrag ?? 0.0008) * dt * 60);
    const maxSpd = this.cfg.maxSpeed ?? 1900;
    const maxSpdSq = maxSpd * maxSpd;

    for (let i = 0; i < this.balls.length; i++) {
      const b = this.balls[i];
      if (b.caught || b.missed) continue;

      b.vy += g * dt;
      b.vx *= drag;
      b.vy *= drag;

      const spdSq = b.vx * b.vx + b.vy * b.vy;
      if (spdSq > maxSpdSq) {
        const scale = maxSpd / Math.sqrt(spdSq);
        b.vx *= scale;
        b.vy *= scale;
      }

      b.x += b.vx * dt;
      b.y += b.vy * dt;

      // Soft outer screen bounds (left/right)
      if (b.x < b.r + 6) {
        b.x = b.r + 6;
        if (b.vx < 0) b.vx = -b.vx * 0.5;
      } else if (b.x > WORLD_W - b.r - 6) {
        b.x = WORLD_W - b.r - 6;
        if (b.vx > 0) b.vx = -b.vx * 0.5;
      }
    }
  }

  _resolveBallCollisions() {
    const balls = this.balls;
    const n = balls.length;
    if (n < 2) return;

    const cs = this.cellSize;
    const grid = this.grid;
    grid.clear();

    for (let i = 0; i < n; i++) {
      const b = balls[i];
      if (b.caught || b.missed) continue;
      const cx = Math.floor(b.x / cs);
      const cy = Math.floor(b.y / cs);
      const key = (cx << 16) ^ cy;
      let cell = grid.get(key);
      if (!cell) {
        cell = [];
        grid.set(key, cell);
      }
      cell.push(i);
    }

    const rest = this.cfg.ballRestitution ?? 0.55;
    const friction = this.cfg.friction ?? 0.012;
    const jamJitter = this.cfg.jamJitter ?? 24;

    for (let i = 0; i < n; i++) {
      const a = balls[i];
      if (a.caught || a.missed) continue;
      const cx = Math.floor(a.x / cs);
      const cy = Math.floor(a.y / cs);
      let neighbors = 0;

      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const cell = grid.get(((cx + ox) << 16) ^ (cy + oy));
          if (!cell) continue;

          for (let k = 0; k < cell.length; k++) {
            const j = cell[k];
            if (j <= i) continue;
            const b = balls[j];
            if (b.caught || b.missed) continue;

            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const minDist = a.r + b.r;
            const distSq = dx * dx + dy * dy;
            if (distSq >= minDist * minDist) continue;
            neighbors++;

            let dist = Math.sqrt(distSq);
            let nx, ny;
            if (dist < 1e-5) {
              const ang = this.prng.range(0, Math.PI * 2);
              nx = Math.cos(ang);
              ny = Math.sin(ang);
              dist = 1e-5;
            } else {
              nx = dx / dist;
              ny = dy / dist;
            }

            // Crisp positional separation so packed balls stack solidly without mushing
            const overlap = (minDist - dist) * 0.54;
            a.x -= nx * overlap;
            a.y -= ny * overlap;
            b.x += nx * overlap;
            b.y += ny * overlap;

            const rvx = b.vx - a.vx;
            const rvy = b.vy - a.vy;
            const velAlongNormal = rvx * nx + rvy * ny;
            if (velAlongNormal > 0) continue;

            const imp = -(1 + rest) * velAlongNormal * 0.5;
            a.vx -= imp * nx;
            a.vy -= imp * ny;
            b.vx += imp * nx;
            b.vy += imp * ny;

            // Light tangential damping
            const tx = -ny;
            const ty = nx;
            const vt = rvx * tx + rvy * ty;
            const fImp = vt * friction * 0.5;
            a.vx += fImp * tx;
            a.vy += fImp * ty;
            b.vx -= fImp * tx;
            b.vy -= fImp * ty;
          }
        }
      }

      // Gentle hopper-shaker micro-vibration on densely jammed lower balls so they
      // keep trickling out the bottom into the catcher while packing tightly upward!
      if (neighbors >= 2 && a.y > 1180 && a.y < 1620 && Math.abs(a.vy) < 95) {
        a.vx += this.prng.range(-jamJitter, jamJitter);
        a.vy += this.prng.range(0, jamJitter * 0.45);
      }
    }
  }

  _resolveEnvironmentCollisions() {
    const balls = this.balls;
    const pins = this.pins;
    const walls = this.walls;
    const spinners = this.spinners;
    const catcherSegs = this.getCatcherSegments();
    const friction = this.cfg.friction ?? 0.012;

    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      if (b.caught || b.missed) continue;

      // 1. Static walls
      for (let w = 0; w < walls.length; w++) {
        const seg = walls[w];
        this._collideBallCapsule(
          b,
          seg.x1,
          seg.y1,
          seg.x2,
          seg.y2,
          seg.thickness * 0.5,
          seg.restitution ?? this.cfg.wallRestitution ?? 0.48,
          0,
          0,
          friction
        );
      }

      // 2. Pins & bumpers
      for (let p = 0; p < pins.length; p++) {
        const pin = pins[p];
        const dx = b.x - pin.x;
        const dy = b.y - pin.y;
        const minDist = b.r + pin.r;
        const distSq = dx * dx + dy * dy;
        if (distSq >= minDist * minDist) continue;

        let dist = Math.sqrt(distSq);
        let nx, ny;
        if (dist < 1e-5) {
          nx = this.prng.sign() * 0.15;
          ny = -0.98;
          dist = 1e-5;
        } else {
          nx = dx / dist;
          ny = dy / dist;
        }

        // Push out
        const overlap = minDist - dist;
        b.x += nx * overlap;
        b.y += ny * overlap;

        const vn = b.vx * nx + b.vy * ny;
        if (vn < 0) {
          const isBumper = pin.kind === 'bumper';
          const rest = pin.restitution ?? (isBumper ? this.cfg.bumperRestitution : this.cfg.pinRestitution);
          const j = -(1 + rest) * vn;
          b.vx += j * nx;
          b.vy += j * ny;

          // Bumper extra radial kick for exciting pinball action
          if (isBumper) {
            const kick = 155;
            b.vx += nx * kick;
            b.vy += ny * kick * 0.72;
          }

          // Anti-deadlock micro-nudge when hitting near dead-center top of a pin
          if (Math.abs(nx) < 0.08 && ny < -0.9 && b.y > 330) {
            b.vx += this.prng.sign() * this.prng.range(38, 82);
          } else if (Math.abs(b.vx) < 18 && Math.abs(b.vy) < 40 && b.y > 340) {
            b.vx += this.prng.sign() * this.prng.range(25, 55);
          }

          // Emit hit event if impact is meaningful (avoid spam during resting contact)
          const impact = -vn;
          if (impact > 55 && (b.lastHitPinId !== pin.id || this.time - b.lastHitTime > 0.06)) {
            pin.flash = 1.0;
            pin.hitCount = (pin.hitCount || 0) + 1;
            b.lastHitPinId = pin.id;
            b.lastHitTime = this.time;
            this.events.pinHits.push({
              ball: b,
              pin,
              x: pin.x + nx * pin.r,
              y: pin.y + ny * pin.r,
              impact,
              isBumper,
            });
          }
        }
      }

      // 3. Rotating spinners
      for (let s = 0; s < spinners.length; s++) {
        const sp = spinners[s];
        const halfL = sp.length * 0.5;
        const cos = Math.cos(sp.angle);
        const sin = Math.sin(sp.angle);
        const x1 = sp.x - cos * halfL;
        const y1 = sp.y - sin * halfL;
        const x2 = sp.x + cos * halfL;
        const y2 = sp.y + sin * halfL;

        // Closest point on spinner determines local tangential velocity
        const abx = x2 - x1;
        const aby = y2 - y1;
        const abLenSq = abx * abx + aby * aby;
        const t = clamp(((b.x - x1) * abx + (b.y - y1) * aby) / abLenSq, 0, 1);
        const cx = x1 + abx * t;
        const cy = y1 + aby * t;
        const rx = cx - sp.x;
        const ry = cy - sp.y;
        // Surface velocity v = omega x r = (-omega * ry, omega * rx)
        const svx = -sp.omega * ry;
        const svy = sp.omega * rx;

        const impact = this._collideBallCapsule(
          b,
          x1,
          y1,
          x2,
          y2,
          sp.thickness * 0.5,
          sp.restitution ?? 0.85,
          svx,
          svy,
          friction
        );
        if (impact > 90) {
          sp.flash = 1.0;
          this.events.spinnerHits.push({ ball: b, spinner: sp, x: cx, y: cy, impact });
        }
      }

      // 4. Moving U-Catcher walls
      for (let k = 0; k < catcherSegs.length; k++) {
        const seg = catcherSegs[k];
        const impact = this._collideBallCapsule(
          b,
          seg.x1,
          seg.y1,
          seg.x2,
          seg.y2,
          seg.r,
          seg.rest,
          seg.vx,
          seg.vy,
          friction
        );
        if (impact > 95 && seg.part !== 'bottom') {
          this.events.catcherRimHits.push({ ball: b, x: b.x, y: b.y, impact });
        }
      }
    }
  }

  _collideBallCapsule(b, x1, y1, x2, y2, capR, restitution, svx, svy, friction) {
    const abx = x2 - x1;
    const aby = y2 - y1;
    const abLenSq = abx * abx + aby * aby;
    let t = 0;
    if (abLenSq > 1e-6) {
      t = clamp(((b.x - x1) * abx + (b.y - y1) * aby) / abLenSq, 0, 1);
    }
    const cx = x1 + abx * t;
    const cy = y1 + aby * t;

    const dx = b.x - cx;
    const dy = b.y - cy;
    const minDist = b.r + capR;
    const distSq = dx * dx + dy * dy;
    if (distSq >= minDist * minDist) return 0;

    let dist = Math.sqrt(distSq);
    let nx, ny;
    if (dist < 1e-5) {
      nx = 0;
      ny = -1;
      dist = 1e-5;
    } else {
      nx = dx / dist;
      ny = dy / dist;
    }

    const overlap = minDist - dist;
    b.x += nx * overlap;
    b.y += ny * overlap;

    const rvx = b.vx - svx;
    const rvy = b.vy - svy;
    const vn = rvx * nx + rvy * ny;
    if (vn >= 0) return 0;

    const j = -(1 + restitution) * vn;
    b.vx += j * nx;
    b.vy += j * ny;

    // Friction along tangent
    const tx = -ny;
    const ty = nx;
    const vt = rvx * tx + rvy * ty;
    b.vx -= vt * friction * tx;
    b.vy -= vt * friction * ty;

    return -vn;
  }

  _checkCatchAndMiss() {
    const c = this.catcher;
    const halfW = c ? c.width * 0.5 : 0;
    const halfH = c ? c.height * 0.5 : 0;
    const cy = c ? c.y + (c.bounceOffset || 0) : 0;

    for (let i = 0; i < this.balls.length; i++) {
      const b = this.balls[i];
      if (b.caught || b.missed) continue;

      if (c) {
        const insideX = Math.abs(b.x - c.x) <= halfW - c.wallThickness * 0.35;
        const insideY = b.y >= cy - halfH * 0.15 && b.y <= cy + halfH + b.r * 0.25;
        if (insideX && insideY) {
          b.caught = true;
          c.hitFlash = 1.0;
          c.bounceVel = Math.min(c.bounceVel + 260, 420);
          this.events.catches.push({ ball: b, x: b.x, y: b.y, catcher: c });
          continue;
        }
      }

      if (b.y > WORLD_H + b.r * 2.4) {
        b.missed = true;
        this.events.misses.push({ ball: b, x: b.x, y: WORLD_H });
      }
    }
  }
}
