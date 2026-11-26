// Unified Mouse & Touch Interactive Board Editor:
// - Select/Drag vertices, midpoint (+) curve-pulling, pins, bumpers, spinners, and horizontal START slider
// - Freehand rounded wall pen (auto Chaikin smoothing), line wall pen, one-tap corner smoothing
// - Pin tap/drag brush, bumper & spinner placement, eraser, background paint/erase brush
// - Mirror (symmetry) mode, Undo/Redo stack, auto-pin fill, and image silhouette auto-tracing

import { WORLD_W, WORLD_H, clamp } from './prng.js';
import {
  HOPPER_TOP_Y,
  HOPPER_CHUTE_BOT_Y,
  cloneDesign,
  distPointToSegment,
  smoothChaikin,
  smoothFreehandStroke,
  autoFillPins,
  traceMaskToPolylines,
} from './boardDesign.js';

export class BoardEditor {
  constructor({ canvas, background, onDesignChange = () => {}, onSelectionChange = () => {} }) {
    this.canvas = canvas;
    this.background = background;
    this.onDesignChange = onDesignChange;
    this.onSelectionChange = onSelectionChange;

    this.active = false;
    this.design = null;
    this.tool = 'select'; // 'select'|'wall_free'|'wall_line'|'pin'|'bumper'|'spinner'|'erase'|'bg_paint'|'bg_erase'
    this.mirror = true;

    this.undoStack = [];
    this.redoStack = [];
    this.selectedPolylineId = null;

    // Live interaction state
    this.pointerDown = false;
    this.activePointerId = null;
    this.dragState = null;
    this.freehandPts = [];
    this.linePreview = null;
    this.lastPinBrushPt = null;
    this.hoverPt = null;
    this.pinBrushSpacing = 96;

    this._bindEvents();
  }

  setDesign(design, { resetHistory = true } = {}) {
    this.design = cloneDesign(design);
    this.selectedPolylineId = null;
    if (resetHistory) {
      this.undoStack = [];
      this.redoStack = [];
    }
    this.onDesignChange(this.design);
  }

  setActive(active) {
    this.active = !!active;
    this.dragState = null;
    this.freehandPts = [];
    this.linePreview = null;
    this.pointerDown = false;
    this.canvas.style.cursor = this.active ? this._cursorForTool() : 'default';
  }

  setTool(tool) {
    this.tool = tool;
    this.dragState = null;
    this.freehandPts = [];
    this.linePreview = null;
    if (this.active) this.canvas.style.cursor = this._cursorForTool();
  }

  _cursorForTool() {
    if (this.tool === 'select') return 'grab';
    if (this.tool === 'erase' || this.tool === 'bg_erase') return 'cell';
    return 'crosshair';
  }

  pushUndo() {
    if (!this.design) return;
    this.undoStack.push(cloneDesign(this.design));
    if (this.undoStack.length > 35) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  undo() {
    if (this.tool === 'bg_paint' || this.tool === 'bg_erase') {
      if (this.background.undoPaint()) return true;
    }
    if (!this.undoStack.length) return false;
    this.redoStack.push(cloneDesign(this.design));
    this.design = this.undoStack.pop();
    this.onDesignChange(this.design);
    return true;
  }

  redo() {
    if (!this.redoStack.length) return false;
    this.undoStack.push(cloneDesign(this.design));
    this.design = this.redoStack.pop();
    this.onDesignChange(this.design);
    return true;
  }

  // Smooth selected polyline (or all polylines if none selected) into silky rounded curves
  smoothWalls() {
    if (!this.design || !this.design.polylines.length) return false;
    this.pushUndo();
    const targets = this.selectedPolylineId
      ? this.design.polylines.filter((p) => p.id === this.selectedPolylineId)
      : this.design.polylines;

    for (const pl of targets) {
      if (pl.points.length >= 3) {
        pl.points = smoothChaikin(pl.points, 1, false);
      }
    }
    this.onDesignChange(this.design);
    return true;
  }

  runAutoFillPins(options = {}) {
    if (!this.design) return 0;
    this.pushUndo();
    const count = autoFillPins(this.design, options);
    this.onDesignChange(this.design);
    return count;
  }

  clearPinsOnly({ keepBumpers = false } = {}) {
    if (!this.design) return;
    this.pushUndo();
    this.design.pins = keepBumpers ? this.design.pins.filter((p) => p.kind === 'bumper') : [];
    this.onDesignChange(this.design);
  }

  // Trace current background image (or an uploaded image) into contoured walls + interior pins!
  traceCurrentBackgroundImage(autoPinOptions = {}) {
    const bg = this.background;
    if (!bg.mediaEl || bg.mediaType === 'none') return { ok: false, reason: 'no_media' };
    const rect = bg.getMediaRect();
    if (!rect) return { ok: false, reason: 'no_rect' };

    const W = 270;
    const H = 480;
    const scaleX = WORLD_W / W;
    const scaleY = WORLD_H / H;

    const off = document.createElement('canvas');
    off.width = W;
    off.height = H;
    const g = off.getContext('2d', { willReadFrequently: true });
    g.clearRect(0, 0, W, H);
    g.drawImage(bg.mediaEl, rect.x / scaleX, rect.y / scaleY, rect.w / scaleX, rect.h / scaleY);

    const imgData = g.getImageData(0, 0, W, H).data;
    const total = W * H;

    // Detect if image has meaningful transparency
    let transparentPx = 0;
    for (let i = 3; i < imgData.length; i += 4) {
      if (imgData[i] < 40) transparentPx++;
    }
    const useAlpha = transparentPx > total * 0.05;

    // Sample corner color if opaque image (e.g. white-background JPG)
    let bgR = 255, bgG = 255, bgB = 255;
    if (!useAlpha) {
      const corners = [0, (W - 1) * 4, ((H - 1) * W) * 4, (W * H - 1) * 4];
      bgR = corners.reduce((s, idx) => s + imgData[idx], 0) / 4;
      bgG = corners.reduce((s, idx) => s + imgData[idx + 1], 0) / 4;
      bgB = corners.reduce((s, idx) => s + imgData[idx + 2], 0) / 4;
    }

    const mask = new Uint8Array(total);
    for (let i = 0; i < total; i++) {
      const p = i * 4;
      if (useAlpha) {
        mask[i] = imgData[p + 3] > 48 ? 1 : 0;
      } else {
        const dr = imgData[p] - bgR;
        const dg = imgData[p + 1] - bgG;
        const db = imgData[p + 2] - bgB;
        mask[i] = Math.hypot(dr, dg, db) > 42 ? 1 : 0;
      }
    }

    const traced = traceMaskToPolylines(mask, W, H, scaleX, scaleY);
    if (!traced) return { ok: false, reason: 'trace_failed' };

    this.pushUndo();
    this.design.startCenterX = traced.startCenterX;
    this.design.startWidth = traced.startWidth;
    this.design.polylines = traced.polylines;
    this.design.spinners = [];
    this.design.bottomExit.includeLedges = false;
    autoFillPins(this.design, { keepBumpers: false, ...autoPinOptions });

    this.selectedPolylineId = null;
    this.onDesignChange(this.design);
    return { ok: true, pins: this.design.pins.length };
  }

  // --- Coordinate mapping (CSS pixels -> 1080x1920 world pixels) ---
  _clientToWorld(ev) {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / Math.max(1, rect.width)) * WORLD_W;
    const y = ((ev.clientY - rect.top) / Math.max(1, rect.height)) * WORLD_H;
    return {
      x: clamp(x, 12, WORLD_W - 12),
      y: clamp(y, 12, WORLD_H - 12),
      isTouch: ev.pointerType === 'touch',
    };
  }

  _bindEvents() {
    this.canvas.addEventListener('pointerdown', (e) => this._onPointerDown(e));
    window.addEventListener('pointermove', (e) => this._onPointerMove(e));
    window.addEventListener('pointerup', (e) => this._onPointerUp(e));
    window.addEventListener('pointercancel', (e) => this._onPointerUp(e));
    // Prevent right-click menu on canvas when editing
    this.canvas.addEventListener('contextmenu', (e) => {
      if (this.active) e.preventDefault();
    });
  }

  _nextId(list) {
    return list.reduce((m, item) => Math.max(m, item.id || 0), 0) + 1;
  }

  _findMirrorVertex(plId, ptIdx, origX, origY) {
    if (!this.mirror) return null;
    const mx = WORLD_W - origX;
    for (const pl of this.design.polylines) {
      for (let i = 0; i < pl.points.length; i++) {
        if (pl.id === plId && i === ptIdx) continue;
        const p = pl.points[i];
        if (Math.hypot(p.x - mx, p.y - origY) < 28) {
          return { pl, idx: i };
        }
      }
    }
    return null;
  }

  _findMirrorPin(pin) {
    if (!this.mirror) return null;
    const mx = WORLD_W - pin.x;
    for (const p of this.design.pins) {
      if (p.id === pin.id) continue;
      if (Math.hypot(p.x - mx, p.y - pin.y) < 28) return p;
    }
    return null;
  }

  _findMirrorSpinner(sp) {
    if (!this.mirror) return null;
    const mx = WORLD_W - sp.x;
    for (const s of this.design.spinners) {
      if (s.id === sp.id) continue;
      if (Math.hypot(s.x - mx, s.y - sp.y) < 34) return s;
    }
    return null;
  }

  _onPointerDown(e) {
    if (!this.active || !this.design) return;
    if (e.button === 2) {
      // Quick right-click erase on PC
      const pt = this._clientToWorld(e);
      this.pushUndo();
      this._eraseAt(pt.x, pt.y, 44);
      this.onDesignChange(this.design);
      return;
    }
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    e.preventDefault();
    this.canvas.setPointerCapture?.(e.pointerId);
    this.activePointerId = e.pointerId;
    this.pointerDown = true;

    const pt = this._clientToWorld(e);
    this.hoverPt = pt;
    const hitScale = pt.isTouch ? 1.55 : 1.0;

    if (this.tool === 'bg_paint' || this.tool === 'bg_erase') {
      this.background.beginPaintStroke(pt.x, pt.y, {
        erase: this.tool === 'bg_erase',
        mirror: this.mirror,
      });
      return;
    }

    if (this.tool === 'wall_free') {
      this.freehandPts = [{ x: pt.x, y: clamp(pt.y, HOPPER_CHUTE_BOT_Y, 1615) }];
      return;
    }

    if (this.tool === 'wall_line') {
      const y = clamp(pt.y, HOPPER_CHUTE_BOT_Y, 1615);
      this.linePreview = { x1: pt.x, y1: y, x2: pt.x, y2: y };
      return;
    }

    if (this.tool === 'pin') {
      this.pushUndo();
      this._placePin(pt.x, pt.y, 'normal');
      this.lastPinBrushPt = { x: pt.x, y: pt.y };
      this.onDesignChange(this.design);
      return;
    }

    if (this.tool === 'bumper') {
      this.pushUndo();
      // If tapping an existing pin, toggle it into a bumper!
      const hitPin = this._hitPin(pt.x, pt.y, 34 * hitScale);
      if (hitPin) {
        hitPin.kind = hitPin.kind === 'bumper' ? 'normal' : 'bumper';
        hitPin.r = hitPin.kind === 'bumper' ? 30 : 10;
        const mp = this._findMirrorPin(hitPin);
        if (mp) {
          mp.kind = hitPin.kind;
          mp.r = hitPin.r;
        }
      } else {
        this._placePin(pt.x, pt.y, 'bumper');
      }
      this.onDesignChange(this.design);
      return;
    }

    if (this.tool === 'spinner') {
      this.pushUndo();
      const hitSp = this._hitSpinner(pt.x, pt.y, 52 * hitScale);
      if (hitSp) {
        hitSp.omega = -hitSp.omega;
        const msp = this._findMirrorSpinner(hitSp);
        if (msp) msp.omega = -hitSp.omega;
      } else {
        this._placeSpinner(pt.x, pt.y);
      }
      this.onDesignChange(this.design);
      return;
    }

    if (this.tool === 'erase') {
      this.pushUndo();
      this._eraseAt(pt.x, pt.y, 44 * hitScale);
      this.onDesignChange(this.design);
      return;
    }

    if (this.tool === 'select') {
      this._beginSelectDrag(pt.x, pt.y, hitScale);
    }
  }

  _onPointerMove(e) {
    if (!this.active || !this.design) return;
    const pt = this._clientToWorld(e);
    this.hoverPt = pt;
    if (!this.pointerDown || e.pointerId !== this.activePointerId) return;
    e.preventDefault();

    const hitScale = pt.isTouch ? 1.55 : 1.0;

    if (this.tool === 'bg_paint' || this.tool === 'bg_erase') {
      this.background.continuePaintStroke(pt.x, pt.y, {
        erase: this.tool === 'bg_erase',
        mirror: this.mirror,
      });
      return;
    }

    if (this.tool === 'wall_free') {
      const y = clamp(pt.y, HOPPER_CHUTE_BOT_Y, 1615);
      const last = this.freehandPts[this.freehandPts.length - 1];
      if (!last || Math.hypot(pt.x - last.x, y - last.y) >= 12) {
        this.freehandPts.push({ x: pt.x, y });
      }
      return;
    }

    if (this.tool === 'wall_line' && this.linePreview) {
      this.linePreview.x2 = pt.x;
      this.linePreview.y2 = clamp(pt.y, HOPPER_CHUTE_BOT_Y, 1615);
      return;
    }

    if (this.tool === 'pin' && this.lastPinBrushPt) {
      if (Math.hypot(pt.x - this.lastPinBrushPt.x, pt.y - this.lastPinBrushPt.y) >= this.pinBrushSpacing) {
        this._placePin(pt.x, pt.y, 'normal');
        this.lastPinBrushPt = { x: pt.x, y: pt.y };
        this.onDesignChange(this.design);
      }
      return;
    }

    if (this.tool === 'erase') {
      if (this._eraseAt(pt.x, pt.y, 44 * hitScale)) {
        this.onDesignChange(this.design);
      }
      return;
    }

    if (this.tool === 'select' && this.dragState) {
      this._updateSelectDrag(pt.x, pt.y);
    }
  }

  _onPointerUp(e) {
    if (!this.pointerDown || e.pointerId !== this.activePointerId) return;
    this.pointerDown = false;
    this.activePointerId = null;

    if (this.tool === 'bg_paint' || this.tool === 'bg_erase') {
      this.background.endPaintStroke();
      return;
    }

    if (this.tool === 'wall_free' && this.freehandPts.length >= 2) {
      const smoothed = smoothFreehandStroke(this.freehandPts);
      this.freehandPts = [];
      if (smoothed.length >= 2) {
        this.pushUndo();
        const id = this._nextId(this.design.polylines);
        this.design.polylines.push({ id, thickness: 12, restitution: 0.44, points: smoothed });
        this.selectedPolylineId = id;

        if (this.mirror) {
          const midAvg = smoothed.reduce((s, p) => s + Math.abs(p.x - WORLD_W * 0.5), 0) / smoothed.length;
          if (midAvg > 30) {
            const id2 = this._nextId(this.design.polylines);
            this.design.polylines.push({
              id: id2,
              thickness: 12,
              restitution: 0.44,
              points: smoothed.map((p) => ({ x: WORLD_W - p.x, y: p.y })),
            });
          }
        }
        this.onDesignChange(this.design);
      }
      return;
    }

    if (this.tool === 'wall_line' && this.linePreview) {
      const { x1, y1, x2, y2 } = this.linePreview;
      this.linePreview = null;
      if (Math.hypot(x2 - x1, y2 - y1) >= 24) {
        this.pushUndo();
        const id = this._nextId(this.design.polylines);
        this.design.polylines.push({
          id,
          thickness: 12,
          restitution: 0.44,
          points: [{ x: x1, y: y1 }, { x: x2, y: y2 }],
        });
        this.selectedPolylineId = id;
        if (this.mirror && (Math.abs(x1 - WORLD_W * 0.5) > 25 || Math.abs(x2 - WORLD_W * 0.5) > 25)) {
          const id2 = this._nextId(this.design.polylines);
          this.design.polylines.push({
            id: id2,
            thickness: 12,
            restitution: 0.44,
            points: [{ x: WORLD_W - x1, y: y1 }, { x: WORLD_W - x2, y: y2 }],
          });
        }
        this.onDesignChange(this.design);
      }
      return;
    }

    if (this.dragState) {
      this.dragState = null;
      this.onDesignChange(this.design);
    }
    this.lastPinBrushPt = null;
  }

  // --- Select / Drag / Midpoint Curve-Pulling ---

  _beginSelectDrag(x, y, hitScale) {
    const d = this.design;
    const halfW = d.startWidth * 0.5;
    const cx = d.startCenterX;

    // 1. Top START horizontal slide handle (height fixed, X freely slidable!)
    if (y >= 70 && y <= 235 && Math.abs(x - cx) <= halfW + 36) {
      this.pushUndo();
      // Left/right edge resize if grabbing near edge
      if (Math.abs(x - (cx - halfW)) < 32 * hitScale) {
        this.dragState = { type: 'start_resize', side: -1 };
        return;
      }
      if (Math.abs(x - (cx + halfW)) < 32 * hitScale) {
        this.dragState = { type: 'start_resize', side: 1 };
        return;
      }
      this.dragState = { type: 'start_move', offsetX: x - cx };
      return;
    }

    // 2. Existing wall vertex handle
    const vRad = 28 * hitScale;
    for (const pl of d.polylines) {
      for (let i = 0; i < pl.points.length; i++) {
        const p = pl.points[i];
        if (Math.hypot(x - p.x, y - p.y) <= vRad) {
          this.pushUndo();
          this.selectedPolylineId = pl.id;
          const mirrorRef = this._findMirrorVertex(pl.id, i, p.x, p.y);
          this.dragState = { type: 'vertex', pl, idx: i, mirrorRef };
          this.onSelectionChange(pl.id);
          return;
        }
      }
    }

    // 3. Wall MIDPOINT (+) handle -> pull to bend a straight wall into a smooth curve!
    const mRad = 28 * hitScale;
    for (const pl of d.polylines) {
      for (let i = 0; i < pl.points.length - 1; i++) {
        const a = pl.points[i];
        const b = pl.points[i + 1];
        if (Math.hypot(b.x - a.x, b.y - a.y) < 38) continue;
        const mx = (a.x + b.x) * 0.5;
        const my = (a.y + b.y) * 0.5;
        if (Math.hypot(x - mx, y - my) <= mRad) {
          this.pushUndo();
          this.selectedPolylineId = pl.id;
          // Insert a new control point right at midpoint!
          pl.points.splice(i + 1, 0, { x: mx, y: my });
          // Also insert mirror midpoint if symmetric twin polyline exists
          let mirrorRef = null;
          if (this.mirror) {
            const targetMx = WORLD_W - mx;
            for (const other of d.polylines) {
              if (other.id === pl.id) continue;
              for (let j = 0; j < other.points.length - 1; j++) {
                const oa = other.points[j];
                const ob = other.points[j + 1];
                const omx = (oa.x + ob.x) * 0.5;
                const omy = (oa.y + ob.y) * 0.5;
                if (Math.hypot(omx - targetMx, omy - my) < 28) {
                  other.points.splice(j + 1, 0, { x: omx, y: omy });
                  mirrorRef = { pl: other, idx: j + 1 };
                  break;
                }
              }
              if (mirrorRef) break;
            }
          }
          this.dragState = { type: 'vertex', pl, idx: i + 1, mirrorRef };
          this.onSelectionChange(pl.id);
          return;
        }
      }
    }

    // 4. Spinners
    const sp = this._hitSpinner(x, y, 42 * hitScale);
    if (sp) {
      this.pushUndo();
      this.dragState = { type: 'spinner', sp, mirrorSp: this._findMirrorSpinner(sp) };
      return;
    }

    // 5. Pins & bumpers
    const pin = this._hitPin(x, y, 30 * hitScale);
    if (pin) {
      this.pushUndo();
      this.dragState = { type: 'pin', pin, mirrorPin: this._findMirrorPin(pin) };
      return;
    }

    // 6. Click on a polyline body to select it (for one-tap Smooth button)
    for (const pl of d.polylines) {
      for (let i = 0; i < pl.points.length - 1; i++) {
        const a = pl.points[i];
        const b = pl.points[i + 1];
        if (distPointToSegment(x, y, a.x, a.y, b.x, b.y) <= 24 * hitScale) {
          this.selectedPolylineId = pl.id;
          this.onSelectionChange(pl.id);
          return;
        }
      }
    }
    this.selectedPolylineId = null;
    this.onSelectionChange(null);
  }

  _updateSelectDrag(x, y) {
    const st = this.dragState;
    const d = this.design;

    if (st.type === 'start_move') {
      const halfW = d.startWidth * 0.5;
      d.startCenterX = clamp(x - st.offsetX, halfW + 44, WORLD_W - halfW - 44);
      this.onDesignChange(d);
      return;
    }

    if (st.type === 'start_resize') {
      const dist = Math.abs(x - d.startCenterX);
      d.startWidth = clamp(dist * 2, 180, 440);
      const halfW = d.startWidth * 0.5;
      d.startCenterX = clamp(d.startCenterX, halfW + 44, WORLD_W - halfW - 44);
      this.onDesignChange(d);
      return;
    }

    if (st.type === 'vertex') {
      const ny = clamp(y, HOPPER_CHUTE_BOT_Y, 1620);
      const nx = clamp(x, 24, WORLD_W - 24);
      st.pl.points[st.idx].x = nx;
      st.pl.points[st.idx].y = ny;
      if (st.mirrorRef) {
        st.mirrorRef.pl.points[st.mirrorRef.idx].x = WORLD_W - nx;
        st.mirrorRef.pl.points[st.mirrorRef.idx].y = ny;
      }
      this.onDesignChange(d);
      return;
    }

    if (st.type === 'pin') {
      const ny = clamp(y, 260, 1475);
      const nx = clamp(x, 42, WORLD_W - 42);
      st.pin.x = nx;
      st.pin.y = ny;
      if (st.mirrorPin) {
        st.mirrorPin.x = WORLD_W - nx;
        st.mirrorPin.y = ny;
      }
      this.onDesignChange(d);
      return;
    }

    if (st.type === 'spinner') {
      const ny = clamp(y, 340, 1420);
      const nx = clamp(x, 110, WORLD_W - 110);
      st.sp.x = nx;
      st.sp.y = ny;
      if (st.mirrorSp) {
        st.mirrorSp.x = WORLD_W - nx;
        st.mirrorSp.y = ny;
      }
      this.onDesignChange(d);
    }
  }

  _hitPin(x, y, rad) {
    for (let i = this.design.pins.length - 1; i >= 0; i--) {
      const p = this.design.pins[i];
      if (Math.hypot(x - p.x, y - p.y) <= Math.max(rad, p.r + 12)) return p;
    }
    return null;
  }

  _hitSpinner(x, y, rad) {
    for (let i = this.design.spinners.length - 1; i >= 0; i--) {
      const sp = this.design.spinners[i];
      if (Math.hypot(x - sp.x, y - sp.y) <= rad) return sp;
    }
    return null;
  }

  _placePin(x, y, kind) {
    const ny = clamp(y, 260, 1475);
    const nx = clamp(x, 42, WORLD_W - 42);
    const r = kind === 'bumper' ? 30 : 10;

    // Prevent stacking right on top of another pin
    if (this._hitPin(nx, ny, r + 16)) return;
    this.design.pins.push({ id: this._nextId(this.design.pins), x: nx, y: ny, r, kind });

    if (this.mirror && Math.abs(nx - WORLD_W * 0.5) > r + 18) {
      const mx = WORLD_W - nx;
      if (!this._hitPin(mx, ny, r + 16)) {
        this.design.pins.push({ id: this._nextId(this.design.pins), x: mx, y: ny, r, kind });
      }
    }
  }

  _placeSpinner(x, y) {
    const ny = clamp(y, 340, 1420);
    const nx = clamp(x, 110, WORLD_W - 110);
    this.design.spinners.push({
      id: this._nextId(this.design.spinners),
      x: nx,
      y: ny,
      length: 196,
      thickness: 14,
      angle: 0.3,
      omega: 2.5,
      restitution: 0.76,
    });
    if (this.mirror && Math.abs(nx - WORLD_W * 0.5) > 85) {
      this.design.spinners.push({
        id: this._nextId(this.design.spinners),
        x: WORLD_W - nx,
        y: ny,
        length: 196,
        thickness: 14,
        angle: -0.3,
        omega: -2.5,
        restitution: 0.76,
      });
    }
  }

  _eraseAt(x, y, rad) {
    let changed = false;
    const pts = this.mirror ? [{ x, y }, { x: WORLD_W - x, y }] : [{ x, y }];

    for (const p of pts) {
      const beforePins = this.design.pins.length;
      this.design.pins = this.design.pins.filter((pin) => Math.hypot(pin.x - p.x, pin.y - p.y) > Math.max(rad, pin.r + 10));
      if (this.design.pins.length !== beforePins) changed = true;

      const beforeSp = this.design.spinners.length;
      this.design.spinners = this.design.spinners.filter((sp) => Math.hypot(sp.x - p.x, sp.y - p.y) > rad + 18);
      if (this.design.spinners.length !== beforeSp) changed = true;

      // Erase wall vertex or segment
      for (let i = this.design.polylines.length - 1; i >= 0; i--) {
        const pl = this.design.polylines[i];
        let hitSeg = false;
        for (let k = 0; k < pl.points.length - 1; k++) {
          const a = pl.points[k];
          const b = pl.points[k + 1];
          if (distPointToSegment(p.x, p.y, a.x, a.y, b.x, b.y) <= rad * 0.7) {
            hitSeg = true;
            break;
          }
        }
        if (hitSeg) {
          this.design.polylines.splice(i, 1);
          changed = true;
        }
      }
    }
    return changed;
  }

  // --- Editor Overlay Rendering on the 1080x1920 Canvas ---
  drawOverlay(ctx) {
    if (!this.active || !this.design) return;
    const d = this.design;
    ctx.save();

    // 1. Center symmetry axis guide when mirror is ON
    if (this.mirror) {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.28)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([12, 12]);
      ctx.beginPath();
      ctx.moveTo(WORLD_W * 0.5, 90);
      ctx.lineTo(WORLD_W * 0.5, 1620);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 2. Fixed bottom catcher lane boundary indicator
    ctx.fillStyle = 'rgba(34, 211, 238, 0.06)';
    ctx.fillRect(0, 1615, WORLD_W, WORLD_H - 1615);
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.35)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(0, 1615);
    ctx.lineTo(WORLD_W, 1615);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '700 22px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(148, 163, 184, 0.72)';
    ctx.textAlign = 'center';
    ctx.fillText('固定エリア（下の出口＆皿レーン）', WORLD_W * 0.5, 1652);

    // 3. Movable START hopper horizontal slider handle (height fixed!)
    const halfW = d.startWidth * 0.5;
    const cx = d.startCenterX;
    ctx.strokeStyle = '#fde047';
    ctx.fillStyle = 'rgba(253, 224, 71, 0.14)';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.roundRect(cx - halfW, HOPPER_TOP_Y - 12, d.startWidth, HOPPER_CHUTE_BOT_Y - HOPPER_TOP_Y + 24, 14);
    ctx.fill();
    ctx.stroke();

    // Left/right arrows indicating horizontal slide
    ctx.font = '800 22px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = '#fde047';
    ctx.textAlign = 'center';
    ctx.fillText('◀ START 左右移動 ▶', cx, HOPPER_TOP_Y + 42);

    // Width resize side knobs
    for (const sx of [cx - halfW, cx + halfW]) {
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(sx, (HOPPER_TOP_Y + HOPPER_CHUTE_BOT_Y) * 0.5, 11, 0, Math.PI * 2);
      ctx.fill();
    }

    // 4. Polyline vertices & midpoint (+) curve-pulling handles
    for (const pl of d.polylines) {
      const isSelected = pl.id === this.selectedPolylineId;
      if (isSelected) {
        ctx.strokeStyle = 'rgba(253, 224, 71, 0.9)';
        ctx.lineWidth = pl.thickness + 8;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        pl.points.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.stroke();
      }

      if (this.tool === 'select') {
        // Midpoint (+) curve-pulling handles
        for (let i = 0; i < pl.points.length - 1; i++) {
          const a = pl.points[i];
          const b = pl.points[i + 1];
          if (Math.hypot(b.x - a.x, b.y - a.y) < 38) continue;
          const mx = (a.x + b.x) * 0.5;
          const my = (a.y + b.y) * 0.5;
          ctx.fillStyle = 'rgba(56, 189, 248, 0.78)';
          ctx.beginPath();
          ctx.arc(mx, my, 13, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#040817';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(mx - 6, my);
          ctx.lineTo(mx + 6, my);
          ctx.moveTo(mx, my - 6);
          ctx.lineTo(mx, my + 6);
          ctx.stroke();
        }

        // Main vertex knobs
        for (const p of pl.points) {
          ctx.fillStyle = isSelected ? '#fde047' : '#ffffff';
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
    }

    // 5. Freehand wall drawing preview
    if (this.freehandPts.length >= 2) {
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      this.freehandPts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
      if (this.mirror) {
        ctx.strokeStyle = 'rgba(253, 224, 71, 0.55)';
        ctx.beginPath();
        this.freehandPts.forEach((p, i) =>
          i === 0 ? ctx.moveTo(WORLD_W - p.x, p.y) : ctx.lineTo(WORLD_W - p.x, p.y)
        );
        ctx.stroke();
      }
    }

    // 6. Line wall preview
    if (this.linePreview) {
      const { x1, y1, x2, y2 } = this.linePreview;
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 12;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      if (this.mirror) {
        ctx.strokeStyle = 'rgba(253, 224, 71, 0.55)';
        ctx.beginPath();
        ctx.moveTo(WORLD_W - x1, y1);
        ctx.lineTo(WORLD_W - x2, y2);
        ctx.stroke();
      }
    }

    // 7. Brush cursor preview for bg_paint / bg_erase / erase
    if (this.hoverPt && (this.tool === 'bg_paint' || this.tool === 'bg_erase' || this.tool === 'erase')) {
      const r = this.tool === 'erase' ? 44 : this.background.brushSize * 0.5;
      ctx.strokeStyle = this.tool === 'bg_paint' ? this.background.brushColor : '#ff2e63';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(this.hoverPt.x, this.hoverPt.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 8. Top Edit Mode Banner
    ctx.fillStyle = 'rgba(253, 224, 71, 0.92)';
    ctx.beginPath();
    ctx.roundRect(WORLD_W * 0.5 - 165, 22, 330, 44, 22);
    ctx.fill();
    ctx.font = '900 24px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = '#090d1a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('EDIT MODE — 編集中', WORLD_W * 0.5, 45);

    ctx.restore();
  }
}
