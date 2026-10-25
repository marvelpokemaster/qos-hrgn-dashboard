/* zoomview.js - pan / zoom canvas helper (cursor-centred wheel zoom, drag pan, double-click reset, HiDPI).
   Used by the scan viewer, the real-graph viewer and the image lightbox. */
"use strict";

class ZoomView {
  /* opts: { draw(ctx, view, zv), content: () => ({w,h}), cellAt(px,py) -> {ox,oy,w,h}, minScale, maxScale,
             onMove(localX, localY, ev, zv), onChange(), onLeave() } */
  constructor(canvas, box, opts = {}) {
    this.canvas = canvas; this.box = box; this.o = opts; this.ctx = canvas.getContext("2d");
    this.view = { s: 1, x: 0, y: 0 }; this.img = null; this.dpr = 1; this.w = 0; this.h = 0; this.fitScale = 1;
    this.drag = null; this.ptrs = new Map(); this.pinch = null;
    const c = canvas;
    c.addEventListener("wheel", e => { e.preventDefault(); const p = this.pos(e); this.zoomAt(p.x, p.y, Math.exp(-e.deltaY * (e.ctrlKey ? .01 : .0018))); }, { passive: false });
    c.addEventListener("pointerdown", e => { c.setPointerCapture(e.pointerId); this.ptrs.set(e.pointerId, this.pos(e)); if (this.ptrs.size === 1) this.drag = { x: e.clientX, y: e.clientY, vx: this.view.x, vy: this.view.y, moved: false }; else if (this.ptrs.size === 2) { this.drag = null; const [a, b] = [...this.ptrs.values()]; this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: this.view.s }; } });
    c.addEventListener("pointermove", e => {
      const p = this.pos(e); if (this.ptrs.has(e.pointerId)) this.ptrs.set(e.pointerId, p);
      if (this.pinch && this.ptrs.size === 2) { const [a, b] = [...this.ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y); this.setScaleAt((a.x + b.x) / 2, (a.y + b.y) / 2, this.pinch.s * d / this.pinch.d); return; }
      if (this.drag) { const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y; if (Math.abs(dx) + Math.abs(dy) > 2) this.drag.moved = true; this.view.x = this.drag.vx + dx; this.view.y = this.drag.vy + dy; this.draw(); this.o.onChange && this.o.onChange(); }
      if (this.o.onMove) { const cell = this.cell(p.x, p.y); this.o.onMove(p.x - cell.ox, p.y - cell.oy, e, this); }
    });
    const up = e => { this.ptrs.delete(e.pointerId); if (this.ptrs.size < 2) this.pinch = null; if (!this.ptrs.size) this.drag = null; };
    c.addEventListener("pointerup", up); c.addEventListener("pointercancel", up);
    c.addEventListener("pointerleave", () => { this.o.onLeave && this.o.onLeave(); });
    c.addEventListener("dblclick", () => this.fit());
    c.style.touchAction = "none";
    if ("ResizeObserver" in window) { let t; new ResizeObserver(() => { clearTimeout(t); t = setTimeout(() => this.resize(), 50); }).observe(box); }
  }
  pos(e) { const r = this.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  cell(px, py) { return this.o.cellAt ? this.o.cellAt(px, py) : { ox: 0, oy: 0, w: this.w, h: this.h }; }
  resize() {
    const r = this.box.getBoundingClientRect(); if (!r.width || !r.height) return;
    this.dpr = Math.min(devicePixelRatio || 1, 2); this.w = r.width; this.h = r.height;
    this.canvas.width = Math.round(r.width * this.dpr); this.canvas.height = Math.round(r.height * this.dpr);
    this.canvas.style.width = r.width + "px"; this.canvas.style.height = r.height + "px";
    const first = !this._fitted; this._fitted = true; if (first) this.fit(); else this.draw();
  }
  setImage(src) {
    this.img = new Image(); this.img.onload = () => { this._fitted = false; this.resize(); }; this.img.onerror = () => { this.img = null; this.draw(); }; this.img.src = src;
  }
  contentSize() { return this.o.content ? this.o.content() : (this.img && this.img.naturalWidth ? { w: this.img.naturalWidth, h: this.img.naturalHeight } : { w: 1, h: 1 }); }
  fit() {
    if (!this.w) { this.resize(); return; }
    const cs = this.contentSize(), cell = this.cell(this.w / 2, this.h / 2), k = Math.min(cell.w / cs.w, cell.h / cs.h) * .94;
    this.fitScale = k; this.view = { s: k, x: (cell.w - cs.w * k) / 2, y: (cell.h - cs.h * k) / 2 }; this.draw(); this.o.onChange && this.o.onChange();
  }
  setScaleAt(px, py, s) {
    const cell = this.cell(px, py), lo = (this.o.minScale || .25) * this.fitScale, hi = (this.o.maxScale || 24) * this.fitScale; s = Math.max(lo, Math.min(hi, s));
    const lx = px - cell.ox, ly = py - cell.oy, k = s / this.view.s;
    this.view.x = lx - (lx - this.view.x) * k; this.view.y = ly - (ly - this.view.y) * k; this.view.s = s; this.draw(); this.o.onChange && this.o.onChange();
  }
  zoomAt(px, py, f) { this.setScaleAt(px, py, this.view.s * f); }
  zoomCentre(f) { this.zoomAt(this.w / 2, this.h / 2, f); }
  draw() {
    if (!this.w) return; const g = this.ctx; g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); g.clearRect(0, 0, this.w, this.h);
    if (this.o.draw) this.o.draw(g, this.view, this); else if (this.img && this.img.complete && this.img.naturalWidth) {
      g.imageSmoothingEnabled = this.view.s < 3; g.save(); g.translate(this.view.x, this.view.y); g.scale(this.view.s, this.view.s); g.drawImage(this.img, 0, 0); g.restore();
    }
  }
}
window.ZoomView = ZoomView;
