// OVERDRIVE 1080x1920 neon arcade renderer — no-holds-barred VFX!
// Massive glowing particle fireworks, laser streaks, multi-ring shockwaves,
// bright comet trails, overdrive edge aura, warning sparks, and explosive overflow finale.

import { WORLD_W, WORLD_H, clamp, hsla } from './prng.js';

export class NeonRenderer {
  constructor(canvas, { background = null, editor = null } = {}) {
    this.canvas = canvas;
    this.canvas.width = WORLD_W;
    this.canvas.height = WORLD_H;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.background = background;
    this.editor = editor;

    this.ballSprites = new Map();

    // High-cap VFX pools (overdrive!)
    this.particles = [];
    this.streaks = [];
    this.rings = [];
    this.popups = [];
    this.returnArcs = [];

    this.shakeTime = 0;
    this.shakeMag = 0;
    this.flashAlpha = 0;
    this.flashColor = '#ffffff';
    this.hudBallPop = 0;
    this.showHud = true;
    this.bgTime = 0;
  }

  resetVfx() {
    this.particles.length = 0;
    this.streaks.length = 0;
    this.rings.length = 0;
    this.popups.length = 0;
    this.returnArcs.length = 0;
    this.shakeTime = 0;
    this.shakeMag = 0;
    this.flashAlpha = 0;
    this.hudBallPop = 0;
  }

  _getBallSprite(hue, radius) {
    const hKey = Math.round((((hue % 360) + 360) % 360) / 8) * 8;
    const rKey = Math.round(radius);
    const key = `${hKey}_${rKey}`;
    let sprite = this.ballSprites.get(key);
    if (sprite) return sprite;

    const size = Math.ceil(rKey * 6.0);
    const half = size * 0.5;
    const off = document.createElement('canvas');
    off.width = size;
    off.height = size;
    const g = off.getContext('2d');

    // Huge vivid neon bloom halo
    const outer = g.createRadialGradient(half, half, rKey * 0.2, half, half, half);
    outer.addColorStop(0, '#ffffff');
    outer.addColorStop(0.22, hsla(hKey, 100, 74, 0.98));
    outer.addColorStop(0.45, hsla(hKey, 100, 56, 0.58));
    outer.addColorStop(0.72, hsla(hKey, 100, 50, 0.2));
    outer.addColorStop(1, hsla(hKey, 100, 50, 0.0));
    g.fillStyle = outer;
    g.fillRect(0, 0, size, size);

    // Hot plasma core
    g.beginPath();
    g.arc(half, half, rKey * 0.96, 0, Math.PI * 2);
    const core = g.createRadialGradient(
      half - rKey * 0.28,
      half - rKey * 0.28,
      rKey * 0.08,
      half,
      half,
      rKey
    );
    core.addColorStop(0, '#ffffff');
    core.addColorStop(0.5, hsla(hKey, 100, 76, 1));
    core.addColorStop(1, hsla(hKey, 100, 48, 1));
    g.fillStyle = core;
    g.fill();

    sprite = { canvas: off, half };
    this.ballSprites.set(key, sprite);
    return sprite;
  }

  triggerShake(magnitude, duration = 0.2) {
    this.shakeMag = Math.max(this.shakeMag, magnitude);
    this.shakeTime = Math.max(this.shakeTime, duration);
  }

  triggerFlash(color, alpha = 0.24) {
    this.flashColor = color;
    this.flashAlpha = Math.max(this.flashAlpha, alpha);
  }

  emitPinHit(x, y, hue, isBumper) {
    if (this.rings.length < 320) {
      this.rings.push({
        x,
        y,
        r: isBumper ? 20 : 9,
        maxR: isBumper ? 140 : 58,
        alpha: isBumper ? 1.0 : 0.78,
        hue,
        lineWidth: isBumper ? 7 : 3.2,
        speed: isBumper ? 440 : 260,
      });
      if (isBumper) {
        this.rings.push({
          x,
          y,
          r: 12,
          maxR: 92,
          alpha: 0.95,
          hue: (hue + 45) % 360,
          lineWidth: 4,
          speed: 320,
        });
      }
    }

    const count = isBumper ? 34 : 8;
    for (let i = 0; i < count && this.particles.length < 2400; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = isBumper ? 180 + Math.random() * 560 : 80 + Math.random() * 240;
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: 0,
        maxLife: isBumper ? 0.5 + Math.random() * 0.35 : 0.26 + Math.random() * 0.2,
        size: isBumper ? 5.5 + Math.random() * 5 : 2.8 + Math.random() * 2.8,
        hue: (hue + (Math.random() - 0.5) * 45 + 360) % 360,
        spark: isBumper || i % 2 === 0,
      });
    }

    if (isBumper) {
      this.triggerShake(10, 0.14);
      this.triggerFlash(hsla(hue, 100, 68, 1), 0.1);
    }
  }

  emitCatch(x, y, spawnCenterX, spawnY, hue, bonus, totalBalls) {
    this.hudBallPop = 1.0;
    this.triggerShake(11 + Math.min(totalBalls * 0.06, 8), 0.2);
    this.triggerFlash(hsla(hue, 100, 68, 1), 0.18);

    // Triple neon shockwaves
    if (this.rings.length < 360) {
      this.rings.push(
        { x, y, r: 20, maxR: 250, alpha: 1.0, hue, lineWidth: 9, speed: 620 },
        { x, y, r: 12, maxR: 180, alpha: 0.95, hue: (hue + 55) % 360, lineWidth: 5.5, speed: 460 },
        { x, y, r: 8, maxR: 120, alpha: 0.9, hue: (hue + 120) % 360, lineWidth: 3.5, speed: 340 }
      );
    }

    // Radial laser streaks bursting out from catcher
    for (let i = 0; i < 14 && this.streaks.length < 280; i++) {
      const ang = -Math.PI + Math.random() * Math.PI;
      this.streaks.push({
        x,
        y,
        ang,
        dist: 16,
        len: 55 + Math.random() * 95,
        speed: 780 + Math.random() * 640,
        life: 0,
        maxLife: 0.28 + Math.random() * 0.18,
        hue: (hue + (Math.random() - 0.5) * 70 + 360) % 360,
        width: 3 + Math.random() * 3.5,
      });
    }

    // Huge fireworks fountain
    const count = 62;
    for (let i = 0; i < count && this.particles.length < 2400; i++) {
      const ang = -Math.PI * 0.96 + Math.random() * Math.PI * 0.92;
      const spd = 220 + Math.random() * 820;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 40,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 140,
        life: 0,
        maxLife: 0.55 + Math.random() * 0.55,
        size: 4.5 + Math.random() * 6.5,
        hue: (hue + (Math.random() - 0.5) * 90 + 360) % 360,
        spark: true,
      });
    }

    // Big bold +1 popup
    if (this.popups.length < 80) {
      this.popups.push({
        x: x + (Math.random() - 0.5) * 30,
        y: y - 48,
        vy: -190,
        text: `+${bonus}`,
        hue,
        life: 0,
        maxLife: 0.95,
        scale: 1.55,
      });
    }

    // Multiple neon return energy beams shooting back up to the START hopper
    const beamCount = Math.min(1 + bonus, 4);
    for (let b = 0; b < beamCount && this.returnArcs.length < 120; b++) {
      const side = b % 2 === 0 ? (x < WORLD_W * 0.5 ? -1 : 1) : (x < WORLD_W * 0.5 ? 1 : -1);
      this.returnArcs.push({
        x0: x + (Math.random() - 0.5) * 36,
        y0: y - 16,
        cx: x + side * (190 + Math.random() * 240),
        cy: (y + spawnY) * 0.5 + (Math.random() - 0.5) * 260,
        x1: spawnCenterX + (Math.random() - 0.5) * 110,
        y1: spawnY,
        t: 0,
        dur: 0.36 + Math.random() * 0.14,
        hue: (hue + b * 40) % 360,
      });
    }
  }

  emitWarningSpark(cx, cy) {
    if (this.particles.length >= 2400) return;
    const ang = -Math.PI + Math.random() * Math.PI;
    const spd = 140 + Math.random() * 340;
    this.particles.push({
      x: cx + (Math.random() - 0.5) * 160,
      y: cy,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd - 60,
      life: 0,
      maxLife: 0.35 + Math.random() * 0.25,
      size: 3.5 + Math.random() * 4,
      hue: 345 + Math.random() * 35,
      spark: true,
    });
  }

  emitOverflowExplosion(cx, cy) {
    this.triggerShake(32, 0.85);
    this.triggerFlash('#ff2e63', 0.62);

    // 5-layer massive shockwave
    for (let k = 0; k < 5; k++) {
      this.rings.push({
        x: cx,
        y: cy,
        r: 20 + k * 28,
        maxR: 520 + k * 170,
        alpha: 1.0,
        hue: (340 + k * 42) % 360,
        lineWidth: 13 - k * 1.8,
        speed: 580 + k * 110,
      });
    }

    // 36 radial explosion lasers
    for (let i = 0; i < 36; i++) {
      const ang = (Math.PI * 2 * i) / 36 + Math.random() * 0.08;
      this.streaks.push({
        x: cx,
        y: cy,
        ang,
        dist: 24,
        len: 120 + Math.random() * 140,
        speed: 900 + Math.random() * 600,
        life: 0,
        maxLife: 0.55 + Math.random() * 0.25,
        hue: (335 + Math.random() * 95) % 360,
        width: 5 + Math.random() * 4,
      });
    }

    // 300 explosive rainbow/crimson particles
    for (let i = 0; i < 300 && this.particles.length < 2800; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 160 + Math.random() * 1080;
      this.particles.push({
        x: cx + (Math.random() - 0.5) * 140,
        y: cy + (Math.random() - 0.5) * 60,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 200,
        life: 0,
        maxLife: 0.9 + Math.random() * 1.1,
        size: 5 + Math.random() * 9,
        hue: (335 + Math.random() * 160) % 360,
        spark: true,
      });
    }
  }

  updateVfx(dt, simState = null, pattern = null) {
    this.bgTime += dt;
    if (this.shakeTime > 0) {
      this.shakeTime = Math.max(0, this.shakeTime - dt);
      if (this.shakeTime === 0) this.shakeMag = 0;
    }
    if (this.flashAlpha > 0) {
      this.flashAlpha = Math.max(0, this.flashAlpha - dt * 1.8);
    }
    if (this.hudBallPop > 0) {
      this.hudBallPop = Math.max(0, this.hudBallPop - dt * 4.5);
    }

    // Emit live danger sparks from START hopper when overflow meter is rising!
    if (simState && pattern && simState.phase === 'running' && simState.overflowMeter > 0.15) {
      const sp = pattern.spawn;
      const midX = (sp.hopperLeftX + sp.hopperRightX) * 0.5;
      const sparkCount = Math.ceil(simState.overflowMeter * 5);
      for (let i = 0; i < sparkCount; i++) {
        this.emitWarningSpark(midX, sp.overflowLineY);
      }
    }

    // Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += 480 * dt;
      p.vx *= 0.982;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    // Laser streaks
    for (let i = this.streaks.length - 1; i >= 0; i--) {
      const s = this.streaks[i];
      s.life += dt;
      if (s.life >= s.maxLife) {
        this.streaks.splice(i, 1);
        continue;
      }
      s.dist += s.speed * dt;
    }

    // Rings
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.r += r.speed * dt;
      if (r.r >= r.maxR) {
        this.rings.splice(i, 1);
      }
    }

    // Popups
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const pop = this.popups[i];
      pop.life += dt;
      if (pop.life >= pop.maxLife) {
        this.popups.splice(i, 1);
        continue;
      }
      pop.y += pop.vy * dt;
      pop.vy *= 0.93;
    }

    // Return energy arcs
    for (let i = this.returnArcs.length - 1; i >= 0; i--) {
      const arc = this.returnArcs[i];
      arc.t += dt / arc.dur;
      if (arc.t >= 1) {
        this.returnArcs.splice(i, 1);
      }
    }
  }

  render(sim) {
    const ctx = this.ctx;
    const { world, pattern, state } = sim;
    const theme = pattern.theme;
    const excitement = clamp((state.totalBalls - 1) / 65, 0, 1);

    ctx.save();

    // Camera micro-shake
    if (this.shakeTime > 0 && this.shakeMag > 0.2) {
      const mag = this.shakeMag * clamp(this.shakeTime / 0.22, 0.25, 1);
      const sx = (Math.random() - 0.5) * 2 * mag;
      const sy = (Math.random() - 0.5) * 2 * mag;
      ctx.translate(sx, sy);
    }

    // 1. Overdrive neon background + reactive energy waves + edge neon glow
    this._drawBackground(ctx, theme, excitement, state.overflowMeter);

    // 2. Start hopper zone & overflow danger line
    this._drawHopperOverlay(ctx, pattern, state);

    // 3. Board walls
    this._drawWalls(ctx, world.walls, theme, excitement);

    // 4. Pins & bumpers
    this._drawPins(ctx, world.pins, theme);

    // 5. Rotating spinners
    this._drawSpinners(ctx, world.spinners, theme);

    // 6. Moving U-Catcher
    if (world.catcher) {
      this._drawCatcher(ctx, world.catcher, theme);
    }

    // 7. Return energy arcs (catcher -> START)
    this._drawReturnArcs(ctx);

    // 8. Ball comet trails + glowing plasma balls
    this._drawBalls(ctx, world.balls);

    // 9. Additive VFX (rings, laser streaks, particles, popups)
    this._drawVfx(ctx);

    // 10. Screen flash
    if (this.flashAlpha > 0.005) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = this.flashAlpha;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
      ctx.restore();
    }

    ctx.restore();

    // 11. Minimal crisp HUD (drawn unshaken, hidden during edit mode)
    if (this.showHud && !(this.editor && this.editor.active)) {
      this._drawHud(ctx, pattern, state);
    }

    // 12. OVERFLOW Finale Banner
    if (state.phase === 'overflow' && !(this.editor && this.editor.active)) {
      this._drawOverflowFinale(ctx, pattern, state);
    }

    // 13. Interactive Editor Overlay (handles, midpoints, symmetry axis, brush preview)
    if (this.editor && this.editor.active) {
      this.editor.drawOverlay(ctx);
    }
  }

  _drawBackground(ctx, theme, excitement, danger) {
    if (this.background) {
      this.background.drawBaseAndMedia(ctx, theme);
    } else {
      const grad = ctx.createLinearGradient(0, 0, 0, WORLD_H);
      grad.addColorStop(0, theme.bgTop);
      grad.addColorStop(1, theme.bgBottom);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    }

    // Intense breathing radial aura (slightly softer when user shows custom background image/video)
    const hasMedia = this.background && this.background.mediaType !== 'none';
    const pulse = 0.5 + 0.5 * Math.sin(this.bgTime * (2.4 + excitement * 6.5));
    const aura = ctx.createRadialGradient(
      WORLD_W * 0.5,
      WORLD_H * 0.5,
      40,
      WORLD_W * 0.5,
      WORLD_H * 0.5,
      WORLD_W * 1.05
    );
    aura.addColorStop(0, theme.bgAura || 'rgba(56, 189, 248, 0.22)');
    aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (hasMedia ? 0.22 : 0.5) + excitement * (hasMedia ? 0.35 : 0.85) + pulse * 0.14;
    ctx.fillStyle = aura;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    ctx.restore();

    // Fast scrolling cyber grid that accelerates with excitement
    const showGrid = !this.background || this.background.showGrid;
    if (showGrid) {
      const gridSpacing = 68;
      const offsetY = (this.bgTime * (28 + excitement * 130)) % gridSpacing;
      ctx.strokeStyle = theme.grid;
      ctx.lineWidth = 1.6 + excitement * 1.0;
      ctx.beginPath();
      for (let x = 0; x <= WORLD_W; x += gridSpacing) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, WORLD_H);
      }
      for (let y = offsetY; y <= WORLD_H; y += gridSpacing) {
        ctx.moveTo(0, y);
        ctx.lineTo(WORLD_W, y);
      }
      ctx.stroke();
    }

    // Overdrive neon border pulse when ball count is climbing high
    if (excitement > 0.15) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const borderHue = (this.bgTime * 90) % 360;
      const borderAlpha = (excitement - 0.15) * (0.28 + 0.22 * pulse);
      ctx.strokeStyle = hsla(borderHue, 100, 60, borderAlpha);
      ctx.lineWidth = 16 + excitement * 18;
      ctx.strokeRect(0, 0, WORLD_W, WORLD_H);
      ctx.restore();
    }

    // Top crimson danger strobe when overflow meter rises
    if (danger > 0.04) {
      const warnPulse = 0.55 + 0.45 * Math.sin(this.bgTime * 22);
      const dGrad = ctx.createLinearGradient(0, 0, 0, 560);
      dGrad.addColorStop(0, `rgba(255, 32, 92, ${(danger * 0.65 * warnPulse).toFixed(3)})`);
      dGrad.addColorStop(1, 'rgba(255, 32, 92, 0)');
      ctx.fillStyle = dGrad;
      ctx.fillRect(0, 0, WORLD_W, 560);
    }
  }

  _drawHopperOverlay(ctx, pattern, state) {
    const sp = pattern.spawn;
    const theme = pattern.theme;
    const danger = state.overflowMeter;
    const midX = (sp.hopperLeftX + sp.hopperRightX) * 0.5;
    const w = sp.hopperRightX - sp.hopperLeftX;

    ctx.save();

    // Spawn range glowing vertical chute beam
    const spawnGrad = ctx.createLinearGradient(0, sp.hopperTopY, 0, sp.yMax + 90);
    spawnGrad.addColorStop(0, danger > 0.2 ? 'rgba(255, 46, 99, 0.38)' : 'rgba(56, 189, 248, 0.24)');
    spawnGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = spawnGrad;
    ctx.fillRect(sp.xMin, sp.hopperTopY, sp.xMax - sp.xMin, sp.yMax - sp.hopperTopY + 90);

    // Overflow threshold glowing laser line
    const lineColor = danger > 0.15 ? theme.danger : 'rgba(255, 92, 138, 0.8)';
    ctx.strokeStyle = lineColor;
    ctx.shadowColor = theme.danger;
    ctx.shadowBlur = danger > 0.15 ? 20 : 8;
    ctx.lineWidth = danger > 0.15 ? 5 : 3;
    ctx.setLineDash([14, 10]);
    ctx.beginPath();
    ctx.moveTo(sp.hopperLeftX - 50, sp.overflowLineY);
    ctx.lineTo(sp.hopperRightX + 50, sp.overflowLineY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;

    // START neon title above hopper
    ctx.font = '900 38px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = danger > 0.25 ? '#ffffff' : theme.accent;
    ctx.shadowColor = danger > 0.25 ? theme.danger : theme.accent;
    ctx.shadowBlur = danger > 0.25 ? 28 : 20;
    ctx.fillText(danger > 0.25 ? 'OVERFLOW!' : 'START', midX, sp.hopperTopY - 48);
    ctx.shadowBlur = 0;

    // Danger progress gauge right above hopper
    if (danger > 0.02) {
      const barW = w + 70;
      const barH = 12;
      const bx = midX - barW * 0.5;
      const by = sp.hopperTopY - 22;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.fillRect(bx, by, barW, barH);
      ctx.shadowColor = theme.danger;
      ctx.shadowBlur = 14;
      ctx.fillStyle = theme.danger;
      ctx.fillRect(bx, by, barW * clamp(danger, 0, 1), barH);
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  }

  _drawWalls(ctx, walls, theme, excitement) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Double outer neon bloom pass
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = theme.wallGlow;
    ctx.globalAlpha = 0.24 + excitement * 0.16;
    for (let i = 0; i < walls.length; i++) {
      const w = walls[i];
      ctx.lineWidth = w.thickness + 26;
      ctx.beginPath();
      ctx.moveTo(w.x1, w.y1);
      ctx.lineTo(w.x2, w.y2);
      ctx.stroke();
    }

    ctx.strokeStyle = theme.wall;
    ctx.globalAlpha = 0.45 + excitement * 0.2;
    for (let i = 0; i < walls.length; i++) {
      const w = walls[i];
      ctx.lineWidth = w.thickness + 10;
      ctx.beginPath();
      ctx.moveTo(w.x1, w.y1);
      ctx.lineTo(w.x2, w.y2);
      ctx.stroke();
    }

    // Crisp bright body
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.strokeStyle = theme.wall;
    for (let i = 0; i < walls.length; i++) {
      const w = walls[i];
      ctx.lineWidth = w.thickness;
      ctx.beginPath();
      ctx.moveTo(w.x1, w.y1);
      ctx.lineTo(w.x2, w.y2);
      ctx.stroke();
    }

    // White hot inner filament
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.88)';
    for (let i = 0; i < walls.length; i++) {
      const w = walls[i];
      ctx.lineWidth = Math.max(2.5, w.thickness * 0.32);
      ctx.beginPath();
      ctx.moveTo(w.x1, w.y1);
      ctx.lineTo(w.x2, w.y2);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawPins(ctx, pins, theme) {
    ctx.save();
    for (let i = 0; i < pins.length; i++) {
      const p = pins[i];
      const isBumper = p.kind === 'bumper';
      const flash = p.flash || 0;
      const r = p.r * (1 + flash * (isBumper ? 0.34 : 0.32));

      // Intense neon halo
      if (isBumper || flash > 0.02) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const glowR = r * (isBumper ? 3.2 : 3.8);
        const g = ctx.createRadialGradient(p.x, p.y, r * 0.2, p.x, p.y, glowR);
        const col = isBumper ? theme.bumper : theme.pinHit;
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.35, col);
        g.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.globalAlpha = isBumper ? 0.6 + flash * 0.4 : flash * 0.95;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, glowR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Pin solid circle
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = isBumper
        ? flash > 0.2 ? '#ffffff' : theme.bumper
        : flash > 0.15 ? theme.pinHit : theme.pin;
      ctx.fill();

      if (isBumper) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 0.62, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.beginPath();
        ctx.arc(p.x - r * 0.22, p.y - r * 0.22, r * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  _drawSpinners(ctx, spinners, theme) {
    if (!spinners.length) return;
    ctx.save();
    ctx.lineCap = 'round';

    for (let i = 0; i < spinners.length; i++) {
      const sp = spinners[i];
      const halfL = sp.length * 0.5;
      const cos = Math.cos(sp.angle);
      const sin = Math.sin(sp.angle);
      const x1 = sp.x - cos * halfL;
      const y1 = sp.y - sin * halfL;
      const x2 = sp.x + cos * halfL;
      const y2 = sp.y + sin * halfL;
      const flash = sp.flash || 0;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = theme.spinner;
      ctx.globalAlpha = 0.45 + flash * 0.55;
      ctx.lineWidth = sp.thickness + 26;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.restore();

      ctx.strokeStyle = flash > 0.25 ? '#ffffff' : theme.spinner;
      ctx.lineWidth = sp.thickness;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, sp.thickness * 0.72, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  _drawCatcher(ctx, c, theme) {
    const halfW = c.width * 0.5;
    const halfH = c.height * 0.5;
    const yOff = c.bounceOffset || 0;
    const leftX = c.x - halfW;
    const rightX = c.x + halfW;
    const topY = c.y - halfH + yOff;
    const botY = c.y + halfH + yOff;
    const flash = c.hitFlash || 0;

    ctx.save();

    // Glowing horizontal rail under the catcher
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(c.minX - halfW * 0.4, c.y + halfH + 24);
    ctx.lineTo(c.maxX + halfW * 0.4, c.y + halfH + 24);
    ctx.stroke();

    // Bright tracker light along rail
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const railGlow = ctx.createRadialGradient(c.x, c.y + halfH + 24, 2, c.x, c.y + halfH + 24, 64);
    railGlow.addColorStop(0, flash > 0.2 ? theme.catcherHit : theme.catcher);
    railGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = railGlow;
    ctx.fillRect(c.x - 70, c.y + halfH - 40, 140, 128);
    ctx.restore();

    // Inner glowing energy field inside U
    const fieldGrad = ctx.createLinearGradient(0, topY, 0, botY);
    const col = flash > 0.15 ? theme.catcherHit : theme.catcher;
    fieldGrad.addColorStop(0, flash > 0.15 ? 'rgba(74, 222, 128, 0.35)' : 'rgba(34, 211, 238, 0.1)');
    fieldGrad.addColorStop(1, flash > 0.15 ? 'rgba(74, 222, 128, 0.85)' : 'rgba(34, 211, 238, 0.48)');
    ctx.fillStyle = fieldGrad;
    ctx.fillRect(leftX, topY + 6, c.width, c.height - 6);

    // Double additive neon bloom around U
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = col;
    ctx.globalAlpha = 0.55 + flash * 0.45;
    ctx.lineWidth = c.wallThickness + 34 + flash * 20;
    ctx.beginPath();
    ctx.moveTo(leftX, topY);
    ctx.lineTo(leftX, botY);
    ctx.lineTo(rightX, botY);
    ctx.lineTo(rightX, topY);
    ctx.stroke();
    ctx.restore();

    // Main U frame
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = flash > 0.3 ? '#ffffff' : col;
    ctx.lineWidth = c.wallThickness;
    ctx.beginPath();
    ctx.moveTo(leftX, topY);
    ctx.lineTo(leftX, botY);
    ctx.lineTo(rightX, botY);
    ctx.lineTo(rightX, topY);
    ctx.stroke();

    // Crisp white inner filament
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(leftX, topY);
    ctx.lineTo(leftX, botY);
    ctx.lineTo(rightX, botY);
    ctx.lineTo(rightX, topY);
    ctx.stroke();

    // "+1" emblem centered inside U
    ctx.font = '900 34px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = col;
    ctx.shadowBlur = 16;
    ctx.fillText(`+${c.bonusLabel || 1}`, c.x, topY + c.height * 0.55);
    ctx.shadowBlur = 0;

    ctx.restore();
  }

  _drawReturnArcs(ctx) {
    if (!this.returnArcs.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';

    for (let i = 0; i < this.returnArcs.length; i++) {
      const a = this.returnArcs[i];
      const tHead = clamp(a.t, 0, 1);
      const tTail = clamp(a.t - 0.38, 0, 1);

      const evalQ = (t) => {
        const u = 1 - t;
        return {
          x: u * u * a.x0 + 2 * u * t * a.cx + t * t * a.x1,
          y: u * u * a.y0 + 2 * u * t * a.cy + t * t * a.y1,
        };
      };

      const steps = 10;
      // Outer laser glow
      ctx.strokeStyle = hsla(a.hue, 100, 62, (1 - a.t * 0.55) * 0.45);
      ctx.lineWidth = 18 * (1 - a.t * 0.35);
      ctx.beginPath();
      for (let s = 0; s <= steps; s++) {
        const p = evalQ(tTail + ((tHead - tTail) * s) / steps);
        if (s === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();

      // Bright core beam
      ctx.strokeStyle = hsla(a.hue, 100, 82, (1 - a.t * 0.45) * 0.95);
      ctx.lineWidth = 6 * (1 - a.t * 0.3);
      ctx.stroke();

      // Blazing comet head
      const head = evalQ(tHead);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(head.x, head.y, 9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  _drawBalls(ctx, balls) {
    if (!balls.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';

    // 1. Vivid comet light trails
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      const tr = b.trail;
      const len = tr.length;
      if (len < 2) continue;

      for (let k = 1; k < len; k++) {
        const ratio = k / len;
        const p0 = tr[k - 1];
        const p1 = tr[k];
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        if (dx * dx + dy * dy > 22000) continue;

        ctx.strokeStyle = hsla(b.hue + ratio * 25, 100, 66, ratio * ratio * 0.62);
        ctx.lineWidth = b.r * 1.45 * ratio;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
      }
    }

    // 2. Blazing plasma balls
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      const sprite = this._getBallSprite(b.hue, b.r);
      ctx.drawImage(sprite.canvas, b.x - sprite.half, b.y - sprite.half);
    }

    ctx.restore();
  }

  _drawVfx(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';

    // Shockwave rings
    for (let i = 0; i < this.rings.length; i++) {
      const r = this.rings[i];
      const progress = r.r / r.maxR;
      const alpha = (1 - progress) * r.alpha;
      if (alpha <= 0.01) continue;
      ctx.strokeStyle = hsla(r.hue, 100, 70, alpha);
      ctx.lineWidth = r.lineWidth * (1 - progress * 0.55);
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Radial laser streaks
    for (let i = 0; i < this.streaks.length; i++) {
      const s = this.streaks[i];
      const alpha = 1 - s.life / s.maxLife;
      const cos = Math.cos(s.ang);
      const sin = Math.sin(s.ang);
      const x1 = s.x + cos * s.dist;
      const y1 = s.y + sin * s.dist;
      const x2 = s.x + cos * (s.dist + s.len * alpha);
      const y2 = s.y + sin * (s.dist + s.len * alpha);

      ctx.strokeStyle = hsla(s.hue, 100, 75, alpha);
      ctx.lineWidth = s.width * alpha;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // Spark particles (stretched along velocity for anime/arcade motion-blur punch!)
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const alpha = 1 - p.life / p.maxLife;
      const sz = p.size * (0.35 + 0.65 * alpha);
      ctx.fillStyle = hsla(p.hue, 100, 76, alpha);
      if (p.spark) {
        ctx.strokeStyle = hsla(p.hue, 100, 78, alpha);
        ctx.lineWidth = sz * 0.85;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.022, p.y - p.vy * 0.022);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, sz, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();

    // Bold floating +1 popups
    if (this.popups.length) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < this.popups.length; i++) {
        const pop = this.popups[i];
        const t = pop.life / pop.maxLife;
        const alpha = t < 0.16 ? t / 0.16 : 1 - (t - 0.16) / 0.84;
        const scale = pop.scale * (1 + Math.sin(Math.min(1, t * 3.2) * Math.PI) * 0.28);
        ctx.save();
        ctx.translate(pop.x, pop.y);
        ctx.scale(scale, scale);
        ctx.globalAlpha = clamp(alpha, 0, 1);
        ctx.font = '900 46px "Segoe UI", system-ui, sans-serif';
        ctx.lineWidth = 7;
        ctx.strokeStyle = 'rgba(4, 7, 20, 0.9)';
        ctx.strokeText(pop.text, 0, 0);
        ctx.fillStyle = hsla(pop.hue, 100, 78, 1);
        ctx.fillText(pop.text, 0, 0);
        ctx.restore();
      }
      ctx.restore();
    }
  }

  _drawHud(ctx, pattern, state) {
    const theme = pattern.theme;
    ctx.save();

    // Top-left: BALLS counter (pops on catch!)
    const popScale = 1 + this.hudBallPop * 0.28;
    ctx.save();
    ctx.translate(48, 56);
    ctx.font = '800 24px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(226, 232, 240, 0.72)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('BALLS', 0, 0);

    ctx.translate(0, 30);
    ctx.scale(popScale, popScale);
    ctx.font = '900 78px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = theme.accent;
    ctx.shadowBlur = 24;
    ctx.fillText(`${state.totalBalls}`, 0, 0);
    ctx.restore();

    // Top-right: TIME & CATCHES
    ctx.save();
    ctx.translate(WORLD_W - 48, 56);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.font = '800 24px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(226, 232, 240, 0.72)';
    ctx.fillText('TIME', 0, 0);

    const mins = Math.floor(state.elapsed / 60);
    const secs = (state.elapsed % 60).toFixed(1).padStart(4, '0');
    ctx.font = '800 46px "Consolas", "Segoe UI", monospace';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(`${String(mins).padStart(2, '0')}:${secs}`, 0, 34);

    ctx.font = '800 26px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = theme.catcher;
    ctx.shadowColor = theme.catcher;
    ctx.shadowBlur = 12;
    ctx.fillText(`CATCH × ${state.catches}`, 0, 96);
    ctx.restore();

    // Subtle bottom title badge
    ctx.font = '800 22px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(226, 232, 240, 0.36)';
    ctx.fillText(pattern.name, WORLD_W * 0.5, WORLD_H - 22);

    ctx.restore();
  }

  _drawOverflowFinale(ctx, pattern, state) {
    const t = clamp(state.overflowElapsed / 0.42, 0, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    const theme = pattern.theme;

    ctx.save();
    ctx.fillStyle = `rgba(4, 7, 20, ${(0.8 * ease).toFixed(3)})`;
    ctx.fillRect(0, WORLD_H * 0.33, WORLD_W, 580);

    ctx.fillStyle = theme.danger;
    ctx.shadowColor = theme.danger;
    ctx.shadowBlur = 24;
    ctx.globalAlpha = ease;
    ctx.fillRect(0, WORLD_H * 0.33, WORLD_W, 8);
    ctx.fillRect(0, WORLD_H * 0.33 + 572, WORLD_W, 8);
    ctx.shadowBlur = 0;

    const cy = WORLD_H * 0.33 + 142;
    ctx.translate(WORLD_W * 0.5, cy);
    const scale = 0.68 + 0.32 * ease;
    ctx.scale(scale, scale);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 124px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = theme.danger;
    ctx.shadowBlur = 42;
    ctx.fillText('OVERFLOW!', 0, 0);
    ctx.shadowBlur = 0;

    ctx.font = '800 34px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(248, 250, 252, 0.85)';
    ctx.fillText(pattern.name, 0, 86);

    const stats = [
      { label: 'TOTAL BALLS', value: `${state.totalBalls}`, color: theme.accent },
      { label: 'CATCHES', value: `${state.catches}`, color: theme.catcherHit },
      { label: 'DURATION', value: `${state.elapsed.toFixed(1)}s`, color: '#fde047' },
    ];
    const spacing = 298;
    stats.forEach((st, idx) => {
      const sx = (idx - 1) * spacing;
      const sy = 242;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.09)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.24)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(sx - 128, sy - 66, 256, 140, 18);
      ctx.fill();
      ctx.stroke();

      ctx.font = '800 22px "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = 'rgba(226, 232, 240, 0.72)';
      ctx.fillText(st.label, sx, sy - 26);

      ctx.font = '900 56px "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = st.color;
      ctx.shadowColor = st.color;
      ctx.shadowBlur = 16;
      ctx.fillText(st.value, sx, sy + 28);
      ctx.shadowBlur = 0;
    });

    ctx.restore();
  }
}
