// Background Layer Manager:
// Handles custom gradient colors, background image or looping video,
// and a full 1080x1920 partial-paint brush layer (all baked straight into canvas recordings).

import { WORLD_W, WORLD_H, clamp } from './prng.js';

export class BackgroundLayer {
  constructor() {
    this.useCustomColors = false;
    this.bgTop = '#040817';
    this.bgBottom = '#0b1128';
    this.showGrid = true;

    // Background image or looping video
    this.mediaType = 'none'; // 'none' | 'image' | 'video'
    this.mediaEl = null;
    this.mediaUrl = null;
    this.mediaName = '';
    this.mediaOpacity = 0.65;
    this.mediaScale = 1.0;
    this.mediaOffsetX = 0;
    this.mediaOffsetY = 0;
    this.mediaFit = 'contain'; // 'contain' | 'cover'

    // Dedicated 1080x1920 canvas for partial background color painting
    this.paintCanvas = document.createElement('canvas');
    this.paintCanvas.width = WORLD_W;
    this.paintCanvas.height = WORLD_H;
    this.paintCtx = this.paintCanvas.getContext('2d');
    this.hasPaint = false;

    // Brush settings
    this.brushColor = '#38bdf8';
    this.brushSize = 90;
    this.brushOpacity = 0.55;
    this.brushSoftness = 0.5;
    this._paintUndoStack = [];
    this._lastPt = null;
  }

  setColors(top, bottom, enable = true) {
    this.bgTop = top;
    this.bgBottom = bottom;
    this.useCustomColors = enable;
  }

  resetColors() {
    this.useCustomColors = false;
  }

  async loadMediaFile(file) {
    if (!file) return null;
    this.clearMedia();

    const url = URL.createObjectURL(file);
    this.mediaUrl = url;
    this.mediaName = file.name || 'media';

    if (file.type.startsWith('video/')) {
      const video = document.createElement('video');
      video.src = url;
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.crossOrigin = 'anonymous';
      await new Promise((resolve, reject) => {
        video.onloadeddata = () => resolve();
        video.onerror = (e) => reject(e);
      });
      await video.play().catch(() => {});
      this.mediaType = 'video';
      this.mediaEl = video;
      return { type: 'video', name: this.mediaName };
    } else {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = url;
      await new Promise((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = (e) => reject(e);
      });
      this.mediaType = 'image';
      this.mediaEl = img;
      return { type: 'image', name: this.mediaName };
    }
  }

  clearMedia() {
    if (this.mediaType === 'video' && this.mediaEl) {
      this.mediaEl.pause();
      this.mediaEl.src = '';
    }
    if (this.mediaUrl) {
      URL.revokeObjectURL(this.mediaUrl);
    }
    this.mediaType = 'none';
    this.mediaEl = null;
    this.mediaUrl = null;
    this.mediaName = '';
  }

  // Compute media destination rect in 1080x1920 world space (used by both renderer & silhouette tracer)
  getMediaRect() {
    if (!this.mediaEl || this.mediaType === 'none') return null;
    const natW = this.mediaType === 'video' ? this.mediaEl.videoWidth : this.mediaEl.naturalWidth;
    const natH = this.mediaType === 'video' ? this.mediaEl.videoHeight : this.mediaEl.naturalHeight;
    if (!natW || !natH) return null;

    const scaleContain = Math.min((WORLD_W * 0.88) / natW, (WORLD_H * 0.72) / natH);
    const scaleCover = Math.max(WORLD_W / natW, WORLD_H / natH);
    const baseScale = this.mediaFit === 'cover' ? scaleCover : scaleContain;
    const finalScale = baseScale * this.mediaScale;

    const drawW = natW * finalScale;
    const drawH = natH * finalScale;
    const cx = WORLD_W * 0.5 + this.mediaOffsetX;
    const cy = WORLD_H * 0.48 + this.mediaOffsetY;

    return {
      x: cx - drawW * 0.5,
      y: cy - drawH * 0.5,
      w: drawW,
      h: drawH,
      natW,
      natH,
    };
  }

  // --- Partial background paint brush ---
  beginPaintStroke(x, y, { erase = false, mirror = false } = {}) {
    this._pushPaintUndo();
    this._lastPt = { x, y };
    this._dabPaint(x, y, erase);
    if (mirror) this._dabPaint(WORLD_W - x, y, erase);
  }

  continuePaintStroke(x, y, { erase = false, mirror = false } = {}) {
    if (!this._lastPt) {
      this.beginPaintStroke(x, y, { erase, mirror });
      return;
    }
    const dx = x - this._lastPt.x;
    const dy = y - this._lastPt.y;
    const dist = Math.hypot(dx, dy);
    const step = Math.max(6, this.brushSize * 0.22);
    const steps = Math.max(1, Math.ceil(dist / step));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const px = this._lastPt.x + dx * t;
      const py = this._lastPt.y + dy * t;
      this._dabPaint(px, py, erase);
      if (mirror) this._dabPaint(WORLD_W - px, py, erase);
    }
    this._lastPt = { x, y };
  }

  endPaintStroke() {
    this._lastPt = null;
  }

  _dabPaint(x, y, erase) {
    const ctx = this.paintCtx;
    const r = Math.max(8, this.brushSize * 0.5);
    ctx.save();
    if (erase) {
      ctx.globalCompositeOperation = 'destination-out';
      const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
    } else {
      this.hasPaint = true;
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = clamp(this.brushOpacity * 0.35, 0.04, 0.85);
      const g = ctx.createRadialGradient(x, y, r * (1 - this.brushSoftness) * 0.4, x, y, r);
      g.addColorStop(0, this.brushColor);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _pushPaintUndo() {
    const snap = document.createElement('canvas');
    snap.width = WORLD_W;
    snap.height = WORLD_H;
    snap.getContext('2d').drawImage(this.paintCanvas, 0, 0);
    this._paintUndoStack.push(snap);
    if (this._paintUndoStack.length > 12) this._paintUndoStack.shift();
  }

  undoPaint() {
    if (!this._paintUndoStack.length) return false;
    const snap = this._paintUndoStack.pop();
    this.paintCtx.clearRect(0, 0, WORLD_W, WORLD_H);
    this.paintCtx.drawImage(snap, 0, 0);
    return true;
  }

  clearPaint() {
    this._pushPaintUndo();
    this.paintCtx.clearRect(0, 0, WORLD_W, WORLD_H);
    this.hasPaint = false;
  }

  exportConfig() {
    return {
      useCustomColors: this.useCustomColors,
      bgTop: this.bgTop,
      bgBottom: this.bgBottom,
      showGrid: this.showGrid,
      mediaOpacity: this.mediaOpacity,
      mediaScale: this.mediaScale,
      mediaOffsetX: this.mediaOffsetX,
      mediaOffsetY: this.mediaOffsetY,
      mediaFit: this.mediaFit,
      paintDataUrl: this.hasPaint ? this.paintCanvas.toDataURL('image/png') : null,
    };
  }

  importConfig(cfg) {
    if (!cfg) return;
    this.useCustomColors = !!cfg.useCustomColors;
    if (cfg.bgTop) this.bgTop = cfg.bgTop;
    if (cfg.bgBottom) this.bgBottom = cfg.bgBottom;
    if (cfg.showGrid !== undefined) this.showGrid = !!cfg.showGrid;
    if (cfg.mediaOpacity !== undefined) this.mediaOpacity = cfg.mediaOpacity;
    if (cfg.mediaScale !== undefined) this.mediaScale = cfg.mediaScale;
    if (cfg.mediaOffsetX !== undefined) this.mediaOffsetX = cfg.mediaOffsetX;
    if (cfg.mediaOffsetY !== undefined) this.mediaOffsetY = cfg.mediaOffsetY;
    if (cfg.mediaFit) this.mediaFit = cfg.mediaFit;

    this.paintCtx.clearRect(0, 0, WORLD_W, WORLD_H);
    this.hasPaint = false;
    if (cfg.paintDataUrl) {
      const img = new Image();
      img.onload = () => {
        this.paintCtx.clearRect(0, 0, WORLD_W, WORLD_H);
        this.paintCtx.drawImage(img, 0, 0, WORLD_W, WORLD_H);
        this.hasPaint = true;
      };
      img.src = cfg.paintDataUrl;
    }
  }

  // Draw base gradient, media (image/video), and partial paint layer onto main 1080x1920 context
  drawBaseAndMedia(ctx, theme) {
    const topCol = this.useCustomColors ? this.bgTop : theme.bgTop;
    const botCol = this.useCustomColors ? this.bgBottom : theme.bgBottom;

    const grad = ctx.createLinearGradient(0, 0, 0, WORLD_H);
    grad.addColorStop(0, topCol);
    grad.addColorStop(1, botCol);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    // Partial color paint layer (under media or softly blended with background)
    if (this.hasPaint) {
      ctx.drawImage(this.paintCanvas, 0, 0);
    }

    // Background image or looping video
    if (this.mediaEl && this.mediaType !== 'none') {
      const rect = this.getMediaRect();
      if (rect) {
        ctx.save();
        ctx.globalAlpha = clamp(this.mediaOpacity, 0, 1);
        ctx.drawImage(this.mediaEl, rect.x, rect.y, rect.w, rect.h);
        ctx.restore();
      }
    }
  }
}
