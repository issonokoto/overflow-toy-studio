// High-level simulation controller: connects Pattern Config, PhysicsWorld,
// NeonRenderer, AudioEngine, spawning/overflow lifecycle, and rule hooks.

import { PRNG, WORLD_W, WORLD_H, clamp } from './prng.js';
import { PhysicsWorld } from './physics.js';

export class OverflowSimulation {
  constructor({ renderer, audio, onStateUpdate = () => {}, onOverflowEnd = () => {} }) {
    this.renderer = renderer;
    this.audio = audio;
    this.onStateUpdate = onStateUpdate;
    this.onOverflowEnd = onOverflowEnd;

    this.pattern = null;
    this.overrides = {};
    this.world = null;
    this.prng = null;
    this.seed = 0;

    this.paused = false;
    this.timeScale = 1.0;

    // Return queue stores balls waiting to drop from START hopper
    this.returnQueue = [];

    this.state = {
      phase: 'running', // 'running' | 'overflow'
      totalBalls: 1,
      activeBalls: 0,
      queuedBalls: 0,
      catches: 0,
      misses: 0,
      elapsed: 0,
      overflowMeter: 0,
      overflowElapsed: 0,
      overflowNotified: false,
      seed: 0,
    };

    this._accumulator = 0;
    this._lastFrame = 0;
    this._rafId = 0;
    this._hudSyncTimer = 0;
  }

  loadPattern(pattern, { seed = null, overrides = null } = {}) {
    this.pattern = pattern;
    if (overrides) {
      this.overrides = { ...overrides };
    } else {
      this.overrides = {
        gravity: pattern.physics.gravity,
        pinRestitution: pattern.physics.pinRestitution,
        catcherSpeed: pattern.catcher.speed,
        catcherWidth: pattern.catcher.width,
        catchBonus: pattern.spawn.catchBonus,
      };
    }

    this.restart(seed);
  }

  // Live board layout update while in Edit Mode (keeps catcher visible, clears balls cleanly)
  applyLayoutPreview(pattern) {
    this.pattern = pattern;
    if (!this.world) {
      this.restart();
      return;
    }
    const layout = pattern.buildLayout(this.prng);
    this.world.walls = layout.walls || [];
    this.world.pins = (layout.pins || []).map((pin, idx) => ({
      id: idx + 1,
      flash: 0,
      hitCount: 0,
      kind: 'normal',
      ...pin,
    }));
    this.world.spinners = (layout.spinners || []).map((sp, idx) => ({
      id: idx + 1,
      flash: 0,
      angle: sp.angle ?? 0,
      ...sp,
    }));
    this.world.balls = [];
    this.returnQueue = [];
    this.state.phase = 'running';
    this.state.overflowMeter = 0;
    this.state.spilledBalls = 0;
    this.renderer.resetVfx();
  }

  setOverride(key, value) {
    this.overrides[key] = value;
    if (!this.world || !this.pattern) return;
    if (key === 'gravity') this.world.cfg.gravity = value;
    if (key === 'pinRestitution') this.world.cfg.pinRestitution = value;
    if (key === 'catcherSpeed' && this.world.catcher) this.world.catcher.speed = value;
    if (key === 'catcherWidth' && this.world.catcher) this.world.catcher.width = value;
  }

  restart(seed = null) {
    if (!this.pattern) return;
    const p = this.pattern;

    this.seed = seed !== null && seed !== undefined
      ? (Number(seed) >>> 0)
      : ((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0);
    this.prng = new PRNG(this.seed);

    const physCfg = {
      ...p.physics,
      gravity: this.overrides.gravity ?? p.physics.gravity,
      pinRestitution: this.overrides.pinRestitution ?? p.physics.pinRestitution,
    };

    this.world = new PhysicsWorld(physCfg, this.prng);

    // Build layout from pattern
    const layout = p.buildLayout(this.prng);
    this.world.walls = layout.walls || [];
    this.world.pins = (layout.pins || []).map((pin, idx) => ({
      id: idx + 1,
      flash: 0,
      hitCount: 0,
      kind: 'normal',
      ...pin,
    }));
    this.world.spinners = (layout.spinners || []).map((sp, idx) => ({
      id: idx + 1,
      flash: 0,
      angle: sp.angle ?? 0,
      ...sp,
    }));

    // Single U-Catcher setup
    const c = p.catcher;
    const startX = this.prng.range(c.minX + 80, c.maxX - 80);
    this.world.catcher = {
      ...c,
      x: startX,
      width: this.overrides.catcherWidth ?? c.width,
      speed: this.overrides.catcherSpeed ?? c.speed,
      dir: this.prng.sign(),
      vx: 0,
      phase: this.prng.range(0, Math.PI * 2),
      bounceOffset: 0,
      bounceVel: 0,
      hitFlash: 0,
      bonusLabel: this.overrides.catchBonus ?? p.spawn.catchBonus,
    };

    this.audio.setScale(p.theme.scale || 'pentatonic');
    this.renderer.resetVfx();
    this.returnQueue = [];
    this.timeScale = 1.0;

    const initialCount = p.spawn.initialBalls ?? 1;
    this.state = {
      phase: 'running',
      totalBalls: initialCount,
      activeBalls: 0,
      queuedBalls: 0,
      catches: 0,
      misses: 0,
      spilledBalls: 0,
      elapsed: 0,
      overflowMeter: 0,
      overflowElapsed: 0,
      overflowNotified: false,
      seed: this.seed,
    };

    // Spawn initial ball(s) immediately so action starts at t=0.0s
    for (let i = 0; i < initialCount; i++) {
      this._spawnBallFromHopper({
        hue: (p.theme.ballHueStart + i * p.theme.ballHueStep) % 360,
        generation: 0,
      });
    }

    this._syncCounts();
    this.onStateUpdate(this.state);
  }

  startLoop() {
    if (this._rafId) return;
    this._lastFrame = performance.now();
    const tick = (now) => {
      this._rafId = requestAnimationFrame(tick);
      const rawDt = Math.min((now - this._lastFrame) / 1000, 0.05);
      this._lastFrame = now;

      if (!this.paused && this.world) {
        this._update(rawDt);
      }
      if (this.world) {
        this.renderer.render(this);
      }
    };
    this._rafId = requestAnimationFrame(tick);
  }

  togglePause() {
    this.paused = !this.paused;
    return this.paused;
  }

  _update(rawDt) {
    const fixedDt = 1 / 60;
    const scaledDt = rawDt * this.timeScale;
    this._accumulator += scaledDt;

    let guard = 0;
    while (this._accumulator >= fixedDt && guard < 4) {
      this._stepFixed(fixedDt);
      this._accumulator -= fixedDt;
      guard++;
    }

    // VFX runs at real frame rate (or subtle slow-mo during overflow finale)
    this.renderer.updateVfx(
      rawDt * (this.state.phase === 'overflow' ? 0.55 : 1.0),
      this.state,
      this.pattern
    );

    if (this.state.phase === 'overflow') {
      this.state.overflowElapsed += rawDt;
      if (!this.state.overflowNotified && this.state.overflowElapsed >= 3.0) {
        this.state.overflowNotified = true;
        this.onOverflowEnd(this.state);
      }
    }

    this._hudSyncTimer += rawDt;
    if (this._hudSyncTimer >= 0.08) {
      this._hudSyncTimer = 0;
      this.onStateUpdate(this.state);
    }
  }

  _stepFixed(dt) {
    const p = this.pattern;
    const hooks = p.hooks || {};

    if (this.state.phase === 'running') {
      this.state.elapsed += dt;
    }

    // Drain return queue into the START hopper
    this._drainReturnQueue();

    // Advance physics
    this.world.step(dt);

    // Custom pattern step hook (if any)
    if (hooks.onStep) hooks.onStep(this, dt);

    // Handle pin hits -> VFX + Audio
    for (const hit of this.world.events.pinHits) {
      const hue = hit.isBumper ? 345 : hit.ball.hue;
      this.renderer.emitPinHit(hit.x, hit.y, hue, hit.isBumper);
      this.audio.playPinHit(hit.x / WORLD_W, hit.y / WORLD_H, hit.impact, hit.isBumper);
      if (hooks.onPinHit) hooks.onPinHit(this, hit);
    }

    // Handle spinner hits
    for (const hit of this.world.events.spinnerHits) {
      this.renderer.emitPinHit(hit.x, hit.y, 285, true);
      this.audio.playPinHit(hit.x / WORLD_W, hit.y / WORLD_H, hit.impact, true);
    }

    // Handle catcher rim clinks
    for (const hit of this.world.events.catcherRimHits) {
      this.renderer.emitPinHit(hit.x, hit.y, 190, false);
      this.audio.playRimClink();
    }

    // Handle catches (+1 ball!)
    const bonus = this.overrides.catchBonus ?? p.spawn.catchBonus ?? 1;
    const spawnMidX = (p.spawn.xMin + p.spawn.xMax) * 0.5;
    for (const ev of this.world.events.catches) {
      this.state.catches++;
      this.state.totalBalls += bonus;

      // Return original ball + newly multiplied ball(s)
      this.returnQueue.push({
        hue: ev.ball.hue,
        generation: ev.ball.generation,
      });
      for (let b = 0; b < bonus; b++) {
        const nextHue =
          (p.theme.ballHueStart + this.state.totalBalls * p.theme.ballHueStep) % 360;
        this.returnQueue.push({
          hue: nextHue,
          generation: ev.ball.generation + 1,
        });
      }

      if (this.world.catcher) {
        this.world.catcher.bonusLabel = bonus;
      }

      this.renderer.emitCatch(
        ev.x,
        ev.y,
        spawnMidX,
        p.spawn.yMin,
        ev.ball.hue,
        bonus,
        this.state.totalBalls
      );
      this.audio.playCatch(this.state.totalBalls);
      if (hooks.onCatch) hooks.onCatch(this, ev);
    }

    // Handle missed balls (return without multiplying)
    for (const ev of this.world.events.misses) {
      this.state.misses++;
      this.returnQueue.push({
        hue: ev.ball.hue,
        generation: ev.ball.generation,
      });
      if (hooks.onMiss) hooks.onMiss(this, ev);
    }

    // Check hopper overflow condition
    if (this.state.phase === 'running') {
      this._evaluateOverflow(dt);
    }

    this._syncCounts();
  }

  _drainReturnQueue() {
    if (this.returnQueue.length === 0) return;

    // Drain aggressively so balls pack deep down into the board until physically full to the rim!
    const maxPerStep = Math.min(this.returnQueue.length, 16);
    for (let k = 0; k < maxPerStep; k++) {
      const next = this.returnQueue[0];
      const spawned = this._spawnBallFromHopper(next);
      if (spawned) {
        this.returnQueue.shift();
      } else {
        break;
      }
    }
  }

  _spawnBallFromHopper(spec) {
    const sp = this.pattern.spawn;
    const r = this.world.cfg.ballRadius;
    const balls = this.world.balls;
    const minClearSq = (r * 1.92) * (r * 1.92);

    // 1) First pack deep inside the START throat & upper funnel so lower/mid gaps fill completely.
    // 2) Once packed to the brim, pour rapidly from above the rim so balls strike the top of the
    //    mound and erupt dramatically over the left/right edges down the outside of the walls!
    const bands = [
      { xMin: sp.xMin, xMax: sp.xMax, yMin: sp.yMin, yMax: sp.yMax + 65, tries: 18, vxRange: 75, vyMin: 220, vyMax: 340 },
      { xMin: sp.xMin, xMax: sp.xMax, yMin: sp.hopperTopY - r * 0.5, yMax: sp.yMin, tries: 12, vxRange: 130, vyMin: 140, vyMax: 230 },
      { xMin: sp.xMin - r * 0.6, xMax: sp.xMax + r * 0.6, yMin: 22, yMax: sp.hopperTopY - r * 0.8, tries: 16, vxRange: 340, vyMin: 160, vyMax: 320 },
    ];

    for (const band of bands) {
      for (let t = 0; t < band.tries; t++) {
        const x = this.prng.range(band.xMin, band.xMax);
        const y = this.prng.range(band.yMin, band.yMax);

        let blocked = false;
        for (let i = 0; i < balls.length; i++) {
          const b = balls[i];
          const dx = b.x - x;
          const dy = b.y - y;
          if (dx * dx + dy * dy < minClearSq) {
            blocked = true;
            break;
          }
        }
        if (!blocked) {
          this.world.addBall({
            x,
            y,
            vx: this.prng.range(-band.vxRange, band.vxRange),
            vy: this.prng.range(band.vyMin, band.vyMax),
            r,
            hue: spec.hue,
            generation: spec.generation,
          });
          return true;
        }
      }
    }

    return false;
  }

  _evaluateOverflow(dt) {
    const sp = this.pattern.spawn;
    const balls = this.world.balls;
    let activeSpilled = 0;
    let moundAboveRim = 0;
    let packedDeep = 0;

    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      if (b.y > 460 && b.y < 1630) {
        packedDeep++;
      }

      // Detect balls physically overflowing OVER the top hopper rim (y < 235, outside vertical chute walls)
      // so they cascade down the OUTSIDE of the mountain walls!
      const outsideLeft = b.x < sp.hopperLeftX - b.r * 0.5;
      const outsideRight = b.x > sp.hopperRightX + b.r * 0.5;
      if (b.y < 235 && (outsideLeft || outsideRight)) {
        activeSpilled++;
        if (!b.countedSpill) {
          b.countedSpill = true;
          this.state.spilledBalls++;
        }
      }

      // Balls forming a visible mound perched above the hopper rim
      if (b.y < sp.hopperTopY - b.r * 0.3 && b.age > 0.2 && Math.abs(b.vy) < 260) {
        moundAboveRim++;
      }
    }

    // Never end on an invisible queue! Require genuine full packing AND real balls spilling over the rim!
    // Threshold scales smoothly so smaller custom shapes (e.g. characters/hearts) also overflow cleanly.
    const realSpillActive = activeSpilled >= 2 || (moundAboveRim >= 4 && activeSpilled >= 1);
    const strongSpill = this.state.spilledBalls >= 4 && (activeSpilled >= 1 || moundAboveRim >= 4);

    if (packedDeep >= 120 && (realSpillActive || strongSpill)) {
      const spillFactor =
        activeSpilled * 0.2 +
        moundAboveRim * 0.06 +
        Math.min(this.state.spilledBalls, 25) * 0.03;
      const fillRate = (0.36 + spillFactor) / (sp.overflowHoldSeconds || 2.0);
      this.state.overflowMeter = clamp(this.state.overflowMeter + fillRate * dt, 0, 1);
    } else if (activeSpilled === 0 && moundAboveRim < 3) {
      this.state.overflowMeter = clamp(this.state.overflowMeter - 0.35 * dt, 0, 1);
    }

    // Hold off final OVERFLOW! banner until at least 8 balls have visibly spilled over the top!
    if (this.state.overflowMeter >= 1.0 && this.state.spilledBalls >= 8) {
      this.state.phase = 'overflow';
      this.state.overflowElapsed = 0;
      this.timeScale = 0.24;
      const midX = (sp.hopperLeftX + sp.hopperRightX) * 0.5;
      this.renderer.emitOverflowExplosion(midX, sp.hopperTopY);
      this.audio.playOverflowFinish();
      if (this.pattern.hooks?.onOverflow) {
        this.pattern.hooks.onOverflow(this, this.state);
      }
      this.onStateUpdate(this.state);
    } else if (this.state.overflowMeter >= 0.99 && this.state.spilledBalls < 8) {
      this.state.overflowMeter = 0.96;
    }
  }

  _syncCounts() {
    this.state.activeBalls = this.world ? this.world.balls.length : 0;
    this.state.queuedBalls = this.returnQueue.length;
  }
}
