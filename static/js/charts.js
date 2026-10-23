/* charts.js - dependency-free SVG charts with HUD styling, tooltips and click handlers.
   Every chart is re-rendered on container resize. Colours come from the caller. */
"use strict";

const C = {};
const NS = "http://www.w3.org/2000/svg";

C.ticks = (min, max, n = 5) => {
  const span = max - min || 1, step0 = span / n, mag = Math.pow(10, Math.floor(Math.log10(step0))), err = step0 / mag;
  const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag, out = [];
  for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + step * 1e-6; v += step) out.push(+v.toFixed(10));
  return out;
};
C.txt = (v, d) => Number.isInteger(v) && d == null ? String(v) : (+v).toFixed(d == null ? (Math.abs(v) < 1 ? 2 : 1) : d);

/* mount(el, draw): draw(w,h) -> {svg:string, after?(svgEl)}; re-run on resize */
C.mount = (el, draw) => {
  if (!el) return;
  const run = () => {
    const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return;
    const r = draw(w, h); el.innerHTML = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img">${r.svg}</svg>`;
    if (r.after) r.after(el.firstElementChild);
  };
  el._redraw = run; run();
  if (!el._ro && "ResizeObserver" in window) { let t; el._ro = new ResizeObserver(() => { clearTimeout(t); t = setTimeout(() => el._redraw && el._redraw(), 60); }); el._ro.observe(el); }
};

C.legend = (el, items, hidden, onChange) => {
  el.innerHTML = items.map(it => `<button data-id="${H.esc(it.id)}" class="${hidden.has(it.id) ? "off" : ""}" style="color:${hidden.has(it.id) ? "" : it.color}" title="Click to show / hide"><i style="background:${it.color};color:${it.color}"></i><span style="color:var(--txt-dim)">${H.esc(it.name)}</span></button>`).join("");
  el.onclick = e => { const b = e.target.closest("button"); if (!b) return; const id = b.dataset.id; hidden.has(id) ? hidden.delete(id) : hidden.add(id); C.legend(el, items, hidden, onChange); onChange(); };
};

/* ---------------------------------------------------------------- grouped bars */
C.bars = (el, o) => C.mount(el, (w, h) => {
  const m = { l: 52, r: 14, t: 16, b: 46 }, pw = w - m.l - m.r, ph = h - m.t - m.b, hidden = o.hidden || new Set();
  const ser = o.series.filter(s => !hidden.has(s.id)), n = Math.max(1, ser.length);
  const y = v => m.t + ph - (v - o.min) / (o.max - o.min) * ph, gw = pw / o.cats.length, bw = Math.min(46, gw * .78 / n), fmt = o.fmt || (v => C.txt(v));
  let s = C.ticks(o.min, o.max, 5).map(t => `<line x1="${m.l}" x2="${w - m.r}" y1="${y(t)}" y2="${y(t)}" stroke="rgba(76,201,240,.1)"/><text x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end">${fmt(t)}</text>`).join("");
  if (o.yLabel) s += `<text transform="translate(13 ${m.t + ph / 2}) rotate(-90)" text-anchor="middle">${H.esc(o.yLabel)}</text>`;
  if (o.zero != null) s += `<line x1="${m.l}" x2="${w - m.r}" y1="${y(o.zero)}" y2="${y(o.zero)}" stroke="#fff" stroke-opacity=".5"/>`;
  const showVal = o.cats.length * n <= 24;
  o.cats.forEach((c, ci) => {
    const cx = m.l + gw * ci + gw / 2, x0 = cx - bw * n / 2;
    s += `<text x="${cx}" y="${h - m.b + 18}" text-anchor="middle" class="lab-strong" style="font-size:11.5px">${H.esc(c.label || c)}</text>`;
    if (c.sub) s += `<text x="${cx}" y="${h - m.b + 32}" text-anchor="middle" style="font-size:10px">${H.esc(c.sub)}</text>`;
    ser.forEach((se, si) => {
      const v = se.values[ci]; if (v == null) return;
      const x = x0 + si * bw, yv = y(H.clamp(v, o.min, o.max)), base = y(o.zero != null ? o.zero : o.min), yy = Math.min(yv, base);
      s += `<rect class="hit" data-c="${ci}" data-s="${si}" x="${x + 1}" y="${yy}" width="${bw - 2}" height="${Math.max(1, Math.abs(base - yv))}" fill="${se.color}" fill-opacity=".78" stroke="${se.color}"/>`;
      if (se.err && se.err[ci] != null) { const lo = y(H.clamp(v - se.err[ci], o.min, o.max)), hi = y(H.clamp(v + se.err[ci], o.min, o.max)), xm = x + bw / 2; s += `<path d="M${xm} ${lo}V${hi}M${xm - 4} ${lo}H${xm + 4}M${xm - 4} ${hi}H${xm + 4}" stroke="#fff" stroke-opacity=".8" fill="none"/>`; }
      const topY = se.err && se.err[ci] != null ? Math.min(yy, y(H.clamp(v + se.err[ci], o.min, o.max))) : yy;
      if (showVal) s += `<text x="${x + bw / 2}" y="${v >= (o.zero ?? o.min) ? topY - 5 : yy + Math.abs(base - yv) + 12}" text-anchor="middle" style="font-size:10px;fill:${se.color}">${fmt(v)}</text>`;
    });
  });
  return {
    svg: s, after: svg => {
      svg.addEventListener("mousemove", e => { const r = e.target.closest(".hit"); if (!r) return H.tip.hide(); const c = +r.dataset.c, si = +r.dataset.s; H.tip.show(o.tip(c, ser[si], si), e); });
      svg.addEventListener("mouseleave", () => H.tip.hide());
      if (o.onClick) svg.addEventListener("click", e => { const r = e.target.closest(".hit"); if (r) o.onClick(+r.dataset.c, ser[+r.dataset.s]); });
    }
  };
});

/* ---------------------------------------------------------------- multi-series line / bar (optional right axis) */
C.lines = (el, o) => C.mount(el, (w, h) => {
  const hidden = o.hidden || new Set(), all = o.series.filter(s => !hidden.has(s.id));
  const hasR = all.some(s => s.axis === 1), m = { l: 54, r: hasR ? 74 : 16, t: 16, b: 42 }, pw = w - m.l - m.r, ph = h - m.t - m.b;
  const xs = all.flatMap(s => s.pts.map(p => p[0])); if (!xs.length) return { svg: `<text x="20" y="30">no data</text>` };
  const xmin = o.xmin ?? Math.min(...xs), xmax = o.xmax ?? Math.max(...xs), X = v => m.l + (v - xmin) / ((xmax - xmin) || 1) * pw;
  const lo = (ax, k, d) => o[k] ?? d, ext = ax => { const v = all.filter(s => (s.axis || 0) === ax).flatMap(s => s.pts.map(p => p[1])); return v.length ? [Math.min(...v), Math.max(...v)] : [0, 1]; };
  const e0 = ext(0), e1 = ext(1), pad = (a, b) => { const d = (b - a) * .08 || .1; return [a - d, b + d]; };
  const y0 = [lo(0, "ymin", pad(...e0)[0]), lo(0, "ymax", pad(...e0)[1])], y1 = [lo(1, "y2min", 0), lo(1, "y2max", e1[1] * 1.1 || 1)];
  const Y = (v, ax) => { const r = ax === 1 ? y1 : y0; return m.t + ph - (v - r[0]) / (r[1] - r[0]) * ph; };
  const fmtY = o.fmtY || (v => C.txt(v)), fmtY2 = o.fmtY2 || (v => C.txt(v));
  let s = C.ticks(y0[0], y0[1], 5).map(t => `<line x1="${m.l}" x2="${w - m.r}" y1="${Y(t, 0)}" y2="${Y(t, 0)}" stroke="rgba(76,201,240,.1)"/><text x="${m.l - 8}" y="${Y(t, 0) + 4}" text-anchor="end">${fmtY(t)}</text>`).join("");
  if (hasR) s += C.ticks(y1[0], y1[1], 5).map(t => `<text x="${w - m.r + 8}" y="${Y(t, 1) + 4}" style="fill:var(--arc-dim)">${fmtY2(t)}</text>`).join("");
  const xt = o.xticks || C.ticks(xmin, xmax, 6).map(v => ({ v, label: C.txt(v) }));
  s += xt.map(t => `<line x1="${X(t.v)}" x2="${X(t.v)}" y1="${m.t}" y2="${m.t + ph}" stroke="rgba(76,201,240,.06)"/><text x="${X(t.v)}" y="${h - m.b + 17}" text-anchor="middle">${H.esc(t.label)}</text>`).join("");
  if (o.xLabel) s += `<text x="${m.l + pw / 2}" y="${h - 6}" text-anchor="middle" style="letter-spacing:.1em">${H.esc(o.xLabel)}</text>`;
  if (o.yLabel) s += `<text transform="translate(13 ${m.t + ph / 2}) rotate(-90)" text-anchor="middle">${H.esc(o.yLabel)}</text>`;
  if (hasR && o.y2Label) s += `<text transform="translate(${w - 8} ${m.t + ph / 2}) rotate(90)" text-anchor="middle" style="fill:var(--arc-dim)">${H.esc(o.y2Label)}</text>`;
  (o.vlines || []).forEach(v => { if (v.x < xmin || v.x > xmax) return; s += `<line x1="${X(v.x)}" x2="${X(v.x)}" y1="${m.t}" y2="${m.t + ph}" stroke="${v.color}" stroke-dasharray="4 4" stroke-opacity=".8"/><text x="${X(v.x) > w - m.r - 70 ? X(v.x) - 5 : X(v.x) + 5}" text-anchor="${X(v.x) > w - m.r - 70 ? "end" : "start"}" y="${m.t + 12}" style="fill:${v.color};font-size:10.5px">${H.esc(v.label)}</text>`; });
  const bars = all.filter(x => x.type === "bar"), lines = all.filter(x => x.type !== "bar");
  bars.forEach(se => { const bw = Math.min(46, pw / Math.max(se.pts.length, 1) * .5); se.pts.forEach(p => { const yy = Y(p[1], se.axis || 0); s += `<rect x="${X(p[0]) - bw / 2}" y="${yy}" width="${bw}" height="${m.t + ph - yy}" fill="${se.color}" fill-opacity=".2" stroke="${se.color}" stroke-opacity=".5"/>`; }); });
  lines.forEach(se => {
    const d = se.pts.map((p, i) => (i ? "L" : "M") + X(p[0]).toFixed(1) + " " + Y(p[1], se.axis || 0).toFixed(1)).join("");
    s += `<path d="${d}" fill="none" stroke="${se.color}" stroke-width="${se.width || 2}" ${se.dash ? `stroke-dasharray="${se.dash}"` : ""} style="filter:drop-shadow(0 0 3px ${se.color})"/>`;
    if (se.dots) se.pts.forEach(p => { s += `<circle cx="${X(p[0])}" cy="${Y(p[1], se.axis || 0)}" r="4" fill="#01050b" stroke="${se.color}" stroke-width="2"/>`; });
  });
  (o.marks || []).forEach(mk => { const se = all.find(x => x.id === mk.series); if (!se) return; const p = se.pts.find(q => q[0] === mk.x); if (!p) return; s += `<circle cx="${X(p[0])}" cy="${Y(p[1], se.axis || 0)}" r="6" fill="none" stroke="${mk.color}" stroke-width="2"/><text x="${X(p[0])}" y="${Y(p[1], se.axis || 0) - 11}" text-anchor="middle" style="fill:${mk.color};font-size:10.5px">${H.esc(mk.label)}</text>`; });
  s += `<g id="xh" style="display:none"><line y1="${m.t}" y2="${m.t + ph}" stroke="var(--arc)" stroke-opacity=".6"/></g><rect id="cap" x="${m.l}" y="${m.t}" width="${pw}" height="${ph}" fill="transparent"/>`;
  return {
    svg: s, after: svg => {
      const cap = svg.querySelector("#cap"), xh = svg.querySelector("#xh"), line = xh.firstElementChild;
      const grid = [...new Set(xs)].sort((a, b) => a - b);
      cap.addEventListener("mousemove", e => {
        const rect = svg.getBoundingClientRect(), px = e.clientX - rect.left, v = xmin + (px - m.l) / pw * (xmax - xmin);
        let best = grid[0]; for (const g of grid) if (Math.abs(g - v) < Math.abs(best - v)) best = g;
        xh.style.display = ""; line.setAttribute("x1", X(best)); line.setAttribute("x2", X(best));
        const rows = all.map(se => { const p = se.pts.find(q => q[0] === best); return p ? [se.name, (se.fmt || fmtY)(p[1]), se.color] : null; }).filter(Boolean);
        H.tip.show(H.tip.rows(o.tipTitle ? o.tipTitle(best) : (o.xName || "x") + " " + C.txt(best), rows, o.tipHint ? o.tipHint(best) : ""), e);
      });
      cap.addEventListener("mouseleave", () => { xh.style.display = "none"; H.tip.hide(); });
    }
  };
});

/* ---------------------------------------------------------------- strip plot with box summary */
C.strip = (el, o) => C.mount(el, (w, h) => {
  const m = { l: 54, r: 16, t: 14, b: 40 }, pw = w - m.l - m.r, ph = h - m.t - m.b, gw = pw / o.groups.length, fmt = o.fmt || (v => C.txt(v));
  const y = v => m.t + ph - (H.clamp(v, o.min, o.max) - o.min) / (o.max - o.min) * ph;
  let s = C.ticks(o.min, o.max, 5).map(t => `<line x1="${m.l}" x2="${w - m.r}" y1="${y(t)}" y2="${y(t)}" stroke="rgba(76,201,240,.1)"/><text x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end">${fmt(t)}</text>`).join("");
  if (o.yLabel) s += `<text transform="translate(13 ${m.t + ph / 2}) rotate(-90)" text-anchor="middle">${H.esc(o.yLabel)}</text>`;
  const clipped = [];
  o.groups.forEach((g, gi) => {
    const cx = m.l + gw * gi + gw / 2, half = Math.min(gw * .36, 90), vals = g.pts.map(p => p.v).filter(v => v != null).sort((a, b) => a - b);
    s += `<text x="${cx}" y="${h - m.b + 18}" text-anchor="middle" class="lab-strong" style="font-size:11.5px;fill:${g.color}">${H.esc(g.label)}</text>`;
    if (vals.length) {
      const q1 = H.quant(vals, .25), q2 = H.quant(vals, .5), q3 = H.quant(vals, .75);
      s += `<rect x="${cx - half}" y="${y(q3)}" width="${half * 2}" height="${Math.max(1, y(q1) - y(q3))}" fill="${g.color}" fill-opacity=".07" stroke="${g.color}" stroke-opacity=".35"/><line x1="${cx - half}" x2="${cx + half}" y1="${y(q2)}" y2="${y(q2)}" stroke="#fff" stroke-width="2"/>`;
      s += `<text x="${cx + half + 4}" y="${y(q2) + 4}" style="font-size:10.5px;fill:#fff">${fmt(q2)}</text>`;
    }
    g.pts.forEach(p => {
      if (p.v == null) return; const jx = (H.hash(p.id + g.key) - .5) * half * 1.7, out = p.v < o.min || p.v > o.max; if (out) clipped.push(p);
      s += `<circle class="hit" data-g="${gi}" data-id="${H.esc(p.id)}" cx="${cx + jx}" cy="${y(p.v)}" r="${out ? 4 : 3.3}" fill="${g.color}" fill-opacity="${out ? .95 : .55}" ${out ? 'stroke="#fff"' : ""}/>`;
    });
  });
  return {
    svg: s, after: svg => {
      const lookup = id => { for (const g of o.groups) { const p = g.pts.find(q => q.id === id); if (p) return [g, p]; } return []; };
      svg.addEventListener("mousemove", e => { const c = e.target.closest(".hit"); if (!c) return H.tip.hide(); const g = o.groups[+c.dataset.g], p = g.pts.find(q => q.id === c.dataset.id); H.tip.show(o.tip(g, p), e); });
      svg.addEventListener("mouseleave", () => H.tip.hide());
      svg.addEventListener("click", e => { const c = e.target.closest(".hit"); if (c && o.onClick) o.onClick(c.dataset.id); });
    }
  };
});

/* ---------------------------------------------------------------- scatter */
C.scatter = (el, o) => C.mount(el, (w, h) => {
  const m = { l: 54, r: 16, t: 14, b: 44 }, pw = w - m.l - m.r, ph = h - m.t - m.b, fmt = o.fmt || (v => C.txt(v));
  const X = v => m.l + (v - o.min) / (o.max - o.min) * pw, Y = v => m.t + ph - (v - o.min) / (o.max - o.min) * ph, tk = C.ticks(o.min, o.max, 5);
  let s = tk.map(t => `<line x1="${m.l}" x2="${w - m.r}" y1="${Y(t)}" y2="${Y(t)}" stroke="rgba(76,201,240,.1)"/><text x="${m.l - 8}" y="${Y(t) + 4}" text-anchor="end">${fmt(t)}</text><line y1="${m.t}" y2="${m.t + ph}" x1="${X(t)}" x2="${X(t)}" stroke="rgba(76,201,240,.06)"/><text x="${X(t)}" y="${h - m.b + 16}" text-anchor="middle">${fmt(t)}</text>`).join("");
  s += `<line x1="${X(o.min)}" y1="${Y(o.min)}" x2="${X(o.max)}" y2="${Y(o.max)}" stroke="#fff" stroke-opacity=".45" stroke-dasharray="5 4"/>`;
  s += `<text x="${m.l + pw / 2}" y="${h - 6}" text-anchor="middle" style="fill:${o.xColor || ""}">${H.esc(o.xLabel || "")}</text><text transform="translate(13 ${m.t + ph / 2}) rotate(-90)" text-anchor="middle" style="fill:${o.yColor || ""}">${H.esc(o.yLabel || "")}</text>`;
  o.pts.forEach(p => { const c = p.color || "var(--arc)"; s += `<circle class="hit" data-id="${H.esc(p.id)}" cx="${X(H.clamp(p.x, o.min, o.max))}" cy="${Y(H.clamp(p.y, o.min, o.max))}" r="${p.big ? 5 : 3.4}" fill="${c}" fill-opacity=".6" stroke="${p.big ? "#fff" : "none"}"/>`; });
  return {
    svg: s, after: svg => {
      svg.addEventListener("mousemove", e => { const c = e.target.closest(".hit"); if (!c) return H.tip.hide(); H.tip.show(o.tip(o.pts.find(q => q.id === c.dataset.id)), e); });
      svg.addEventListener("mouseleave", () => H.tip.hide());
      svg.addEventListener("click", e => { const c = e.target.closest(".hit"); if (c && o.onClick) o.onClick(c.dataset.id); });
    }
  };
});

/* ---------------------------------------------------------------- forest plot (difference + CI) */
C.forest = (el, o) => C.mount(el, (w, h) => {
  const m = { l: 235, r: 80, t: 22, b: 40 }, pw = w - m.l - m.r, ph = h - m.t - m.b, rows = o.rows, rh = ph / Math.max(rows.length, 1);
  const lo = Math.min(...rows.map(r => r.lo), 0), hi = Math.max(...rows.map(r => r.hi), 0), pad = (hi - lo) * .1 || .01, a = lo - pad, b = hi + pad;
  const X = v => m.l + (v - a) / (b - a) * pw, fmt = o.fmt || (v => C.txt(v, 3));
  let s = C.ticks(a, b, 6).map(t => `<line x1="${X(t)}" x2="${X(t)}" y1="${m.t}" y2="${m.t + ph}" stroke="rgba(76,201,240,.1)"/><text x="${X(t)}" y="${h - m.b + 17}" text-anchor="middle">${fmt(t)}</text>`).join("");
  s += `<line x1="${X(0)}" x2="${X(0)}" y1="${m.t}" y2="${m.t + ph}" stroke="#fff" stroke-width="1.5" stroke-opacity=".7"/>`;
  s += `<text x="${m.l + pw / 2}" y="${h - 6}" text-anchor="middle">${H.esc(o.xLabel || "")}</text>`;
  s += `<text x="${X(0) - 6}" y="${m.t - 4}" text-anchor="end" style="font-size:10px">← control better</text><text x="${X(0) + 6}" y="${m.t - 4}" style="font-size:10px">reference better →</text>`;
  rows.forEach((r, i) => {
    const cy = m.t + rh * i + rh / 2, sig = r.lo > 0 || r.hi < 0, col = r.color || (sig ? "var(--gold)" : "var(--txt-dim)");
    s += `<g class="hit" data-i="${i}"><rect x="0" y="${cy - rh / 2}" width="${w}" height="${rh}" fill="transparent"/><text x="${m.l - 12}" y="${cy + 4}" text-anchor="end" class="lab-strong" style="font-size:12px">${H.esc(r.label)}</text>`;
    s += `<line x1="${X(r.lo)}" x2="${X(r.hi)}" y1="${cy}" y2="${cy}" stroke="${col}" stroke-width="3" stroke-linecap="round"/><path d="M${X(r.lo)} ${cy - 6}V${cy + 6}M${X(r.hi)} ${cy - 6}V${cy + 6}" stroke="${col}" stroke-width="2"/>`;
    s += `<circle cx="${X(r.diff)}" cy="${cy}" r="6" fill="#01050b" stroke="${col}" stroke-width="3"/><text x="${w - m.r + 8}" y="${cy + 4}" style="font-size:11.5px;fill:${col}">${H.sgn(r.diff, 4)}</text></g>`;
  });
  return {
    svg: s, after: svg => {
      svg.addEventListener("mousemove", e => { const g = e.target.closest(".hit"); if (!g) return H.tip.hide(); H.tip.show(o.tip(rows[+g.dataset.i]), e); });
      svg.addEventListener("mouseleave", () => H.tip.hide());
    }
  };
});

/* ---------------------------------------------------------------- stepped histogram */
C.hist = (el, o) => C.mount(el, (w, h) => {
  const hidden = o.hidden || new Set(), ser = o.series.filter(s => !hidden.has(s.id)), m = { l: 54, r: 14, t: 14, b: 40 }, pw = w - m.l - m.r, ph = h - m.t - m.b;
  const bins = o.bins, nb = bins.length - 1, vals = ser.map(s => { const tot = s.counts.reduce((a, b) => a + b, 0) || 1; return s.counts.map(c => o.norm ? c / tot : c); });
  const ymax = Math.max(1e-9, ...vals.flat()) * 1.1, X = v => m.l + (v - bins[0]) / (bins[nb] - bins[0]) * pw, Y = v => m.t + ph - v / ymax * ph;
  const fmt = o.norm ? (v => (v * 100).toFixed(v * 100 < 10 ? 1 : 0) + "%") : (v => v >= 1000 ? (v / 1000).toFixed(1) + "k" : C.txt(v, 0));
  let s = C.ticks(0, ymax, 4).map(t => `<line x1="${m.l}" x2="${w - m.r}" y1="${Y(t)}" y2="${Y(t)}" stroke="rgba(76,201,240,.1)"/><text x="${m.l - 8}" y="${Y(t) + 4}" text-anchor="end">${fmt(t)}</text>`).join("");
  s += C.ticks(bins[0], bins[nb], 5).map(t => `<text x="${X(t)}" y="${h - m.b + 17}" text-anchor="middle">${C.txt(t)}</text>`).join("") + `<text x="${m.l + pw / 2}" y="${h - 6}" text-anchor="middle">${H.esc(o.xLabel || "")}</text>`;
  (o.vlines || []).forEach((v, vi) => { s += `<line x1="${X(v.x)}" x2="${X(v.x)}" y1="${m.t}" y2="${m.t + ph}" stroke="${v.color}" stroke-dasharray="4 4"/><text x="${X(v.x) > w - m.r - 60 ? X(v.x) - 4 : X(v.x) + 4}" text-anchor="${X(v.x) > w - m.r - 60 ? "end" : "start"}" y="${m.t + 11 + vi * 13}" style="font-size:10px;fill:${v.color}">${H.esc(v.label)}</text>`; });
  ser.forEach((se, si) => {
    let d = `M${X(bins[0])} ${Y(0)}`; vals[si].forEach((v, i) => { d += `L${X(bins[i])} ${Y(v)}L${X(bins[i + 1])} ${Y(v)}`; }); d += `L${X(bins[nb])} ${Y(0)}Z`;
    s += `<path d="${d}" fill="${se.color}" fill-opacity=".13" stroke="${se.color}" stroke-width="1.6" style="filter:drop-shadow(0 0 3px ${se.color})"/>`;
  });
  s += `<rect id="cap" x="${m.l}" y="${m.t}" width="${pw}" height="${ph}" fill="transparent"/><line id="xh" y1="${m.t}" y2="${m.t + ph}" stroke="var(--arc)" stroke-opacity=".6" style="display:none"/>`;
  return {
    svg: s, after: svg => {
      const cap = svg.querySelector("#cap"), xh = svg.querySelector("#xh");
      cap.addEventListener("mousemove", e => {
        const rect = svg.getBoundingClientRect(), v = bins[0] + (e.clientX - rect.left - m.l) / pw * (bins[nb] - bins[0]); let i = bins.findIndex((b, k) => k < nb && v >= b && v < bins[k + 1]); if (i < 0) i = nb - 1;
        xh.style.display = ""; xh.setAttribute("x1", X(bins[i])); xh.setAttribute("x2", X(bins[i]));
        H.tip.show(H.tip.rows((o.xName || "bin") + " " + C.txt(bins[i], 2) + "–" + C.txt(bins[i + 1], 2), ser.map((se, si) => [se.name, fmt(vals[si][i]) + (o.norm ? ` <span class="faint">(${se.counts[i]})</span>` : ""), se.color])), e);
      });
      cap.addEventListener("mouseleave", () => { xh.style.display = "none"; H.tip.hide(); });
    }
  };
});
