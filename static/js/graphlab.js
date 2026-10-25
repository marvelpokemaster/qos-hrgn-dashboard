/* graphlab.js - 04 GRAPH LAB
   (a) Interactive 3-D hologram of the typed heterogeneous supervoxel graph. The TOPOLOGY is a schematic sample
       (the notebooks do not save node coordinates); everything that carries a number - effective hops per
       region/node type and edge gates alpha at boundary vs interior - is SAMPLED FROM THE REAL test-set histograms.
   (b) The real explanation-graph figure produced by the notebook, in a zoom / pan viewer.
   (c) A chart of the real, aggregated gate alpha statistics. */
"use strict";

(() => {
  const REL = [{ id: "t1ce-spatial", name: "T1ce spatial", color: "#b57bee", real: "t1ce-spatial-t1ce" }, { id: "flair-spatial", name: "FLAIR spatial", color: "#1fc8a3", real: "flair-spatial-flair" }, { id: "cross", name: "T1ce ↔ FLAIR", color: "#ff9b3d", real: "t1ce-corresponds-flair" }];
  const CLSN = ["Background", "NCR/NET", "Edema", "Enhancing"], CLSC = ["#8794a0", "#e15759", "#59a14f", "#f1ce63"], REGION_OF = ["BG", "TC", "WT", "ET"];
  const NMIN = 240, NMAX = 15000, BIG = 2500;
  const L = { seed: 7, N: 1200, nodes: [], edges: [], yaw: .6, pitch: .28, zoom: 1.3, vy: 0, vp: 0, drag: null, hover: -1, sel: -1, color: "class", rf: "fixed", K: 2, rel: { "t1ce-spatial": true, "flair-spatial": true, cross: true }, pulse: true, spin: true, gate: false, edgesOn: true, hist: null, bfs: null, t0: 0, last: 0, quietUntil: 0, running: false, w: 0, h: 0, dpr: 1, view: "sim", zvReal: null, px: null, py: null, pz: null, pk: null, cols: [], order: [], buildMs: 0 };

  const hopColor = t => { t = H.clamp(t / 2, 0, 1); const a = [11, 60, 93], b = [92, 243, 255], c = [255, 179, 0], [p, q, u] = t < .5 ? [a, b, t * 2] : [b, c, (t - .5) * 2]; return `rgb(${p.map((v, i) => Math.round(v + (q[i] - v) * u)).join(",")})`; };
  const nOfSlider = v => Math.round(NMIN * Math.pow(NMAX / NMIN, v / 1000));
  const sliderOfN = n => Math.round(1000 * Math.log(n / NMIN) / Math.log(NMAX / NMIN));

  /* cached inverse-CDF sampler over a saved histogram */
  const samplers = new Map();
  function sampler(h) {
    if (!h || !h.hist) return null; if (samplers.has(h)) return samplers.get(h);
    const tot = h.hist.reduce((a, b) => a + b, 0); let s = null;
    if (tot) { const cdf = []; let c = 0; h.hist.forEach(v => { c += v; cdf.push(c / tot); }); const bins = L.hist.bins; s = R => { const r = R(); let i = 0; while (i < cdf.length - 1 && r > cdf[i]) i++; return bins[i] + R() * (bins[i + 1] - bins[i]); }; }
    samplers.set(h, s); return s;
  }
  const sampleHist = (h, R) => { const s = sampler(h); return s ? s(R) : null; };
  const cbrt = Math.cbrt;

  /* uniform spatial hash used for k-nearest-neighbour queries (keeps 15 000 nodes interactive) */
  function makeGrid(pos, ids, s) { const m = new Map(); ids.forEach(i => { const k = (((Math.floor((pos[3 * i] + 1.5) / s)) * 1024 + Math.floor((pos[3 * i + 1] + 1.5) / s)) * 1024 + Math.floor((pos[3 * i + 2] + 1.5) / s)); let a = m.get(k); if (!a) m.set(k, a = []); a.push(i); }); return { m, s }; }
  function knn(pos, a, grid, k, self, maxD) {
    const { m, s } = grid, ax = pos[3 * a], ay = pos[3 * a + 1], az = pos[3 * a + 2], cx = Math.floor((ax + 1.5) / s), cy = Math.floor((ay + 1.5) / s), cz = Math.floor((az + 1.5) / s);
    const bi = [], bd = [];
    for (let r = 1; r <= 7; r++) {
      bi.length = 0; bd.length = 0;
      for (let x = cx - r; x <= cx + r; x++) for (let y = cy - r; y <= cy + r; y++) for (let z = cz - r; z <= cz + r; z++) {
        const c = m.get((x * 1024 + y) * 1024 + z); if (!c) continue;
        for (let q = 0; q < c.length; q++) { const b = c[q]; if (self && b === a) continue; const d = Math.hypot(pos[3 * b] - ax, pos[3 * b + 1] - ay, pos[3 * b + 2] - az); if (bi.length < k) { let j = bi.length; bi.push(b); bd.push(d); while (j > 0 && bd[j - 1] > d) { bd[j] = bd[j - 1]; bi[j] = bi[j - 1]; j--; } bd[j] = d; bi[j] = b; } else if (d < bd[k - 1]) { let j = k - 1; while (j > 0 && bd[j - 1] > d) { bd[j] = bd[j - 1]; bi[j] = bi[j - 1]; j--; } bd[j] = d; bi[j] = b; } }
      }
      if (bi.length >= k && bd[k - 1] <= r * s) break; if (maxD && r * s > maxD) break;
    }
    return bi.map((b, j) => [b, bd[j]]);
  }

  function generate(seed, total) {
    const t0 = performance.now(), per = Math.floor(total / 2), n = per * 2;
    const R = H.rng(seed * 7919 + 13), C = [.28, -.05, .08], nodes = new Array(n), edges = [], pos = new Float32Array(3 * n);
    const shell = [[0, .15], [.15, .24], [.24, .40]];
    const sampleNode = t => {
      const u = R(), cls = u < .36 ? 0 : u < .64 ? 2 : u < .82 ? 3 : 1; let p;
      if (cls === 0) { do { p = [(R() * 2 - 1) * .95, (R() * 2 - 1) * .8, (R() * 2 - 1) * .75]; } while ((p[0] / .95) ** 2 + (p[1] / .8) ** 2 + (p[2] / .75) ** 2 > 1 || Math.hypot(p[0] - C[0], p[1] - C[1], p[2] - C[2]) < .46); }
      else { const [r0, r1] = shell[cls === 1 ? 0 : cls === 3 ? 1 : 2], r = cbrt(r0 ** 3 + R() * (r1 ** 3 - r0 ** 3)), th = Math.acos(2 * R() - 1), ph = 2 * Math.PI * R(); p = [C[0] + r * Math.sin(th) * Math.cos(ph), C[1] + r * Math.sin(th) * Math.sin(ph), C[2] + r * Math.cos(th)]; }
      let pred = cls; if (R() < .08) pred = (cls + 1 + Math.floor(R() * 3)) % 4;
      return { t, p, cls, pred };
    };
    for (let i = 0; i < n; i++) { const nd = sampleNode(i < per ? 0 : 1); nd.id = i; nd.nb = []; nodes[i] = nd; pos[3 * i] = nd.p[0]; pos[3 * i + 1] = nd.p[1]; pos[3 * i + 2] = nd.p[2]; }
    nodes.forEach(nd => { const nt = nd.t ? "flair" : "t1ce", agg = L.hist.aggregate[nt] && L.hist.aggregate[nt][REGION_OF[nd.pred]]; const h = sampleHist(agg, R); nd.hop = h == null ? 1 : h; nd.region = REGION_OF[nd.pred]; });
    const seen = new Set(), add = (a, b, rel) => { const k = a < b ? a * n + b : b * n + a; if (seen.has(k)) return; seen.add(k); const bd = nodes[a].pred !== nodes[b].pred, real = L.hist.gates[REL[rel].real]; const g = sampleHist(real && real[bd ? "boundary" : "interior"], R); const ei = edges.length; edges.push({ a, b, rel, bd, gate: g == null ? .3 : g, i: ei }); nodes[a].nb.push(ei); nodes[b].nb.push(ei); };
    const s = Math.max(.03, cbrt(6 * .268 / (.64 * per))), ids = [[], []]; nodes.forEach(nd => ids[nd.t].push(nd.id));
    const grids = ids.map(a => makeGrid(pos, a, s));
    for (let t = 0; t < 2; t++) ids[t].forEach(a => knn(pos, a, grids[t], 4, true).forEach(([b]) => add(a, b, t)));
    const thr = .3 * Math.min(1, cbrt(NMIN / n) * 1.6);
    ids[0].forEach(a => { const r = knn(pos, a, grids[1], 1, false, thr); if (r.length && r[0][1] < thr) add(a, r[0][0], 2); });
    Object.assign(L, { nodes, edges, N: n, sel: -1, hover: -1, bfs: null, px: new Float32Array(n), py: new Float32Array(n), pz: new Float32Array(n), pk: new Float32Array(n), buildMs: performance.now() - t0 });
    colorize(); samplers.clear();
  }

  /* per-node colour cache; draw order grouped by colour so big graphs batch fill-style switches */
  function colorize() {
    L.cols = L.nodes.map(n => L.color === "class" ? CLSC[n.pred] : L.color === "hop" ? hopColor(Math.round(n.hop * 8) / 8) : (n.t ? "#ffb300" : "#5cf3ff"));
    L.order = L.nodes.map((_, i) => i).sort((a, b) => (L.cols[a] < L.cols[b] ? -1 : L.cols[a] > L.cols[b] ? 1 : 0));
  }

  /* breadth-first receptive field over the currently visible relations */
  function computeBfs() {
    if (L.sel < 0) { L.bfs = null; return; }
    const sel = L.nodes[L.sel], Kc = L.rf === "fixed" ? L.K : H.clamp(Math.round(sel.hop), 0, 2), dist = new Map([[L.sel, 0]]), frontier = [[L.sel]], paths = [];
    for (let d = 0; d < Kc; d++) { const nxt = []; frontier[d].forEach(u => L.nodes[u].nb.forEach(ei => { const e = L.edges[ei]; if (!L.rel[REL[e.rel].id]) return; const v = e.a === u ? e.b : e.a; if (!dist.has(v)) { dist.set(v, d + 1); nxt.push(v); paths.push({ ei, from: v, to: u, d: d + 1 }); } else if (dist.get(v) === d + 1) paths.push({ ei, from: v, to: u, d: d + 1 }); })); frontier.push(nxt); }
    L.bfs = { K: Kc, dist, paths, counts: frontier.map(f => f.length) };
  }

  function project() {
    const cy = Math.cos(L.yaw), sy = Math.sin(L.yaw), cp = Math.cos(L.pitch), sp = Math.sin(L.pitch), sc = Math.min(L.w, L.h) * .43 * L.zoom, cx = L.w / 2, cyy = L.h / 2, n = L.N, { px, py, pz, pk, nodes } = L;
    for (let i = 0; i < n; i++) { const p = nodes[i].p, x = p[0] * cy + p[2] * sy, z0 = -p[0] * sy + p[2] * cy, y = p[1] * cp - z0 * sp, z = p[1] * sp + z0 * cp, k = 2.8 / (2.8 + z); px[i] = cx + x * k * sc; py[i] = cyy + y * k * sc; pz[i] = z; pk[i] = k; }
    return { sc, cx, cyy };
  }

  function frame(ts) {
    if (!L.running) return; requestAnimationFrame(frame);
    if (H.cur !== "graph" || L.view !== "sim" || document.hidden || !L.nodes.length) return;
    const dt = Math.min(.05, (ts - (L.last || ts)) / 1000); L.last = ts; draw(ts / 1000, dt);
  }

  function ring(g, i, r, col, lw, sq) { const x = L.px[i], y = L.py[i]; g.strokeStyle = col; g.lineWidth = lw; if (sq) g.strokeRect(x - r - 3, y - r - 3, r * 2 + 6, r * 2 + 6); else { g.beginPath(); g.arc(x, y, r + 3.5, 0, 6.3); g.stroke(); } }

  function draw(t, dt) {
    const g = L.ctx; if (!L.w) return;
    if (!L.drag) { L.yaw += L.vy; L.pitch = H.clamp(L.pitch + L.vp, -1.3, 1.3); L.vy *= .93; L.vp *= .93; if (L.spin && t > L.quietUntil) L.yaw += dt * .12; }
    g.setTransform(L.dpr, 0, 0, L.dpr, 0, 0); g.clearRect(0, 0, L.w, L.h);
    const n = L.N, big = n > BIG, { px, py, pz, pk } = L, { sc, cx, cyy } = project(), bfs = L.bfs, vis = e => L.rel[REL[e.rel].id];
    const dens = Math.min(1, Math.sqrt(NMIN / n)), r0 = H.clamp(5.2 * Math.pow(NMIN / n, .38), 1.05, 5.2) * Math.sqrt(L.zoom);
    g.save(); g.strokeStyle = "rgba(92,243,255,.07)"; g.lineWidth = 1; for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse(cx, cyy, sc * (.92 - k * .03), sc * (.78 - k * .03), 0, 0, 6.3); g.stroke(); } g.restore();
    // ---- edges
    const inPath = new Set(bfs ? bfs.paths.map(p => p.ei) : []);
    if (!big) {
      if (L.edgesOn || bfs) {
        const es = []; L.edges.forEach(e => { if (vis(e)) es.push({ e, z: (pz[e.a] + pz[e.b]) / 2 }); }); es.sort((a, b) => b.z - a.z);
        es.forEach(({ e, z }) => {
          const hot = inPath.has(e.i), dim = bfs && !hot; if (!L.edgesOn && !hot) return; const depth = H.clamp(1 - (z + 1) / 2.4, .25, 1);
          g.strokeStyle = REL[e.rel].color; g.globalAlpha = hot ? .95 : dim ? .04 : (L.gate ? .15 + .7 * e.gate : .32 * Math.max(.4, dens)) * depth;
          g.lineWidth = hot ? 1.6 + 2.6 * e.gate : L.gate ? .5 + 2.8 * e.gate : Math.max(.6, dens); g.beginPath(); g.moveTo(px[e.a], py[e.a]); g.lineTo(px[e.b], py[e.b]); g.stroke();
        });
      }
    } else {
      if (L.edgesOn && !bfs) {            // batched: one path per relation x depth bucket
        const B = [[], [], []].map(() => [[], [], []]);
        L.edges.forEach(e => { if (!vis(e)) return; const z = (pz[e.a] + pz[e.b]) / 2, d = z < -.25 ? 0 : z < .3 ? 1 : 2; B[e.rel][d].push(e); });
        g.lineWidth = .6; B.forEach((rb, ri) => rb.forEach((arr, d) => { if (!arr.length) return; g.strokeStyle = REL[ri].color; g.globalAlpha = [.28, .17, .08][d]; g.beginPath(); arr.forEach(e => { g.moveTo(px[e.a], py[e.a]); g.lineTo(px[e.b], py[e.b]); }); g.stroke(); }));
      } else if (bfs) {
        g.lineCap = "round"; bfs.paths.forEach(p => { const e = L.edges[p.ei]; g.strokeStyle = REL[e.rel].color; g.globalAlpha = .95; g.lineWidth = 1.2 + 2.2 * e.gate; g.beginPath(); g.moveTo(px[e.a], py[e.a]); g.lineTo(px[e.b], py[e.b]); g.stroke(); });
      }
    }
    g.globalAlpha = 1;
    // ---- pulses = messages flowing inward, farthest hop first
    if (bfs && L.pulse && bfs.K > 0) {
      const cyc = 2.4, ph = (t % cyc) / cyc, glow = bfs.paths.length < 400;
      bfs.paths.forEach(p => { const s = bfs.K - p.d, lo = s / bfs.K, hi = (s + 1) / bfs.K; if (ph < lo || ph > hi) return; const u = (ph - lo) / (hi - lo), x = px[p.from] + (px[p.to] - px[p.from]) * u, y = py[p.from] + (py[p.to] - py[p.from]) * u, e = L.edges[p.ei]; g.fillStyle = "#fff"; if (glow) { g.shadowColor = REL[e.rel].color; g.shadowBlur = 14; } g.beginPath(); g.arc(x, y, 2.6 + 2 * e.gate, 0, 6.3); g.fill(); g.shadowBlur = 0; });
    }
    // ---- nodes
    const nodesArr = L.nodes, hl = new Set(); if (bfs) bfs.dist.forEach((_, i) => hl.add(i)); if (L.hover >= 0) hl.add(L.hover); if (L.sel >= 0) hl.add(L.sel);
    if (!big) {
      const glow = n <= 700, order = nodesArr.map((_, i) => i).sort((a, b) => pz[b] - pz[a]);
      order.forEach(i => {
        const nd = nodesArr[i], d = bfs ? bfs.dist.get(i) : undefined, dim = bfs && d === undefined, depth = H.clamp(1 - (pz[i] + 1) / 2.6, .35, 1), r = r0 * pk[i] * (i === L.sel ? 1.5 : 1);
        g.globalAlpha = dim ? .13 : depth; g.fillStyle = L.cols[i]; if (glow && !dim) { g.shadowColor = g.fillStyle; g.shadowBlur = 8 * pk[i]; }
        if (nd.t) g.fillRect(px[i] - r, py[i] - r, r * 2, r * 2); else { g.beginPath(); g.arc(px[i], py[i], r, 0, 6.3); g.fill(); }
        g.shadowBlur = 0; g.globalAlpha = 1;
      });
    } else {
      let last = null; g.globalAlpha = bfs ? .1 : .9;
      for (let j = 0; j < n; j++) { const i = L.order[j]; if (bfs && hl.has(i)) continue; const c = L.cols[i]; if (c !== last) { g.fillStyle = c; last = c; } const r = r0 * pk[i]; g.fillRect(px[i] - r, py[i] - r, r * 2, r * 2); }
      g.globalAlpha = 1;
      hl.forEach(i => { const r = r0 * pk[i] * (i === L.sel ? 1.5 : 1.2) + 1; g.fillStyle = L.cols[i]; const nd = nodesArr[i]; if (nd.t) g.fillRect(px[i] - r, py[i] - r, r * 2, r * 2); else { g.beginPath(); g.arc(px[i], py[i], r, 0, 6.3); g.fill(); } });
    }
    hl.forEach(i => {
      const nd = nodesArr[i], d = bfs ? bfs.dist.get(i) : undefined, r = r0 * pk[i] * (i === L.sel ? 1.5 : 1);
      const col = i === L.sel ? "#ffb300" : d === 1 ? "#5cf3ff" : d === 2 ? "#b57bee" : "#fff"; ring(g, i, r, col, i === L.sel ? 2.4 : 1.6, nd.t);
      if (i === L.sel) { g.strokeStyle = "rgba(255,179,0,.5)"; const pulse = 8 + 8 * ((t * .8) % 1); g.beginPath(); g.arc(px[i], py[i], r + pulse, 0, 6.3); g.stroke(); }
    });
    if (!L._info || t - L._info > .15) { L._info = t; info(); }
  }

  function info() {
    const i = L.hover >= 0 ? L.hover : L.sel, box = H.$("#lab-info");
    if (i < 0) { box.innerHTML = `<b>Hover</b> a node to inspect it<br><b>Click</b> to trace its receptive field<br><span class="dim">${L.N.toLocaleString()} nodes · ${L.edges.length.toLocaleString()} edges<br>(real graph ≈ ${Math.round(H.M.kpis.nodes / 1000)}k nodes · ≈ ${Math.round(H.M.kpis.edges / 1000)}k edges)</span>`; return; }
    const n = L.nodes[i], gs = n.nb.map(ei => L.edges[ei]).filter(e => L.rel[REL[e.rel].id]);
    let s = `<b>${n.t ? "FLAIR" : "T1ce"} node #${i}</b>${i === L.sel ? " (target)" : ""}<br>prediction: <span style="color:${CLSC[n.pred]}">${CLSN[n.pred]}</span><br>effective hop: <b>${H.f(n.hop, 2)}</b> <span class="dim">→ ${H.clamp(Math.round(n.hop), 0, 2)}-hop field</span><br>degree: ${gs.length} · mean gate α: ${H.f(H.mean(gs.map(e => e.gate)), 2)}`;
    if (i === L.sel && L.bfs) s += `<br><span class="dim">receptive field</span> hop0 ${L.bfs.counts[0]}${L.bfs.counts.slice(1).map((c, k) => ` · hop${k + 1} +${c}`).join("")} <b>= ${L.bfs.counts.reduce((a, b) => a + b, 0)}</b> nodes`;
    box.innerHTML = s;
  }

  function pick(x, y) { if (!L.px) return -1; let best = -1, bd = 1e9; const lim = L.N > BIG ? 9 : 14, { px, py, pz, pk } = L; for (let i = 0; i < L.N; i++) { const d = Math.hypot(px[i] - x, py[i] - y) - 3 * pk[i]; if (d < lim) { const s = d + pz[i] * 5; if (s < bd) { bd = s; best = i; } } } return best; }

  function legend() {
    const sh = `<span><i style="background:#5cf3ff"></i>T1ce node (circle)</span><span><i class="sq" style="background:#ffb300"></i>FLAIR node (square)</span>`;
    const mid = L.color === "class" ? [1, 2, 3, 0].map(k => `<span><i style="background:${CLSC[k]}"></i>${CLSN[k]}</span>`).join("") : L.color === "hop" ? `<span style="display:inline-flex;align-items:center;gap:6px">effective hop 0<span style="width:120px;height:8px;background:linear-gradient(90deg,${hopColor(0)},${hopColor(1)},${hopColor(2)})"></span>2</span>` : sh;
    H.$("#lab-legend").innerHTML = mid + `<span class="faint">rings: <span style="color:#ffb300">target</span> · <span style="color:#5cf3ff">hop 1</span> · <span style="color:#b57bee">hop 2</span></span>`;
  }

  function sizeCanvas() { if (!L.canvas) return; const box = H.$("#lab-stage"), r = box.getBoundingClientRect(); if (!r.width) return; L.dpr = Math.min(devicePixelRatio || 1, 2); L.w = r.width; L.h = r.height; const c = L.canvas; c.width = Math.round(r.width * L.dpr); c.height = Math.round(r.height * L.dpr); c.style.width = r.width + "px"; c.style.height = r.height + "px"; }

  function gateChart() {
    const gs = L.hist.gates, rels = Object.keys(gs), nice = { "t1ce-spatial-t1ce": "T1ce spatial", "flair-spatial-flair": "FLAIR spatial", "t1ce-corresponds-flair": "T1ce ← FLAIR", "flair-corresponds-t1ce": "FLAIR ← T1ce" }, two = { "t1ce-spatial-t1ce": ["T1ce", "spatial"], "flair-spatial-flair": ["FLAIR", "spatial"], "t1ce-corresponds-flair": ["T1ce←", "FLAIR"], "flair-corresponds-t1ce": ["FLAIR←", "T1ce"] };
    const ser = [{ id: "boundary", name: "tumour boundary", color: "#ffb300", values: rels.map(r => gs[r].boundary && gs[r].boundary.mean) }, { id: "interior", name: "interior", color: "#5cf3ff", values: rels.map(r => gs[r].interior && gs[r].interior.mean) }];
    C.bars(H.$("#chart-gates"), { cats: rels.map(r => ({ label: (two[r] || [r, ""])[0], sub: (two[r] || [r, ""])[1] })), series: ser, min: 0, max: Math.max(.6, ...ser.flatMap(s => s.values)) * 1.15, fmt: v => C.txt(v, 2), yLabel: "mean gate α", tip: (ci, se) => { const d = gs[rels[ci]][se.id]; return H.tip.rows((nice[rels[ci]] || rels[ci]) + " · " + se.name, [["mean α", H.f(d.mean, 3), se.color], ["edges", (d.n || 0).toLocaleString()]]); } });
    const parts = rels.map(r => { const b = gs[r].boundary.mean, i = gs[r].interior.mean; return { r, b, i, ratio: b / i }; });
    const sp = parts.filter(p => p.r.includes("spatial")), cr = parts.filter(p => p.r.includes("corresponds"));
    H.$("#gate-note").innerHTML = `Aggregated over all ${Object.keys(L.hist.patients).length} test patients. Spatial gates are ${sp.every(p => p.ratio > 1) ? "higher" : "not uniformly higher"} at tumour boundaries (${sp.map(p => H.f(p.b, 2) + " vs " + H.f(p.i, 2)).join(", ")}); cross-modal gates are ${cr.every(p => p.ratio < 1) ? "higher in the interior" : "mixed"} (${cr.map(p => H.f(p.b, 2) + " vs " + H.f(p.i, 2)).join(", ")}). Descriptive: it shows the gates are not constant, not that they improve Dice.`;
  }

  function setCount(n, why) {
    n = H.clamp(Math.round(n / 2) * 2, NMIN, NMAX); H.$("#lab-n").value = sliderOfN(n); H.$("#lab-n-v").textContent = n.toLocaleString();
    const msg = H.$("#lab-n-msg"); msg.textContent = "building…";
    setTimeout(() => { generate(L.seed, n); computeBfs(); msg.textContent = `${L.N.toLocaleString()} nodes · ${L.edges.length.toLocaleString()} edges · built in ${Math.round(L.buildMs)} ms`; H.$$("#lab-presets button").forEach(b => b.classList.toggle("on", +b.dataset.n === L.N)); if (why) H.toast(why); }, 20);
  }

  function bindControls() {
    const cv = L.canvas;
    cv.addEventListener("pointerdown", e => { cv.setPointerCapture(e.pointerId); L.drag = { x: e.clientX, y: e.clientY, moved: 0 }; cv.classList.add("drag"); L.vy = L.vp = 0; });
    cv.addEventListener("pointermove", e => {
      const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      if (L.drag) { const dx = e.clientX - L.drag.x, dy = e.clientY - L.drag.y; L.drag.moved += Math.abs(dx) + Math.abs(dy); L.yaw += dx * .0065; L.pitch = H.clamp(L.pitch + dy * .0065, -1.3, 1.3); L.vy = dx * .0012; L.vp = dy * .0012; L.drag.x = e.clientX; L.drag.y = e.clientY; L.quietUntil = performance.now() / 1000 + 3; }
      else { const now = performance.now(); if (L.N > BIG && now - (L._pk || 0) < 40) return; L._pk = now; const h = pick(x, y); if (h !== L.hover) { L.hover = h; cv.style.cursor = h >= 0 ? "pointer" : "grab"; } }
    });
    cv.addEventListener("pointerup", e => { const moved = L.drag ? L.drag.moved : 99; L.drag = null; cv.classList.remove("drag"); if (moved < 5) { const r = cv.getBoundingClientRect(), h = pick(e.clientX - r.left, e.clientY - r.top); L.sel = h === L.sel ? -1 : h; computeBfs(); L._info = 0; } });
    cv.addEventListener("pointerleave", () => { L.hover = -1; });
    cv.addEventListener("wheel", e => { e.preventDefault(); L.zoom = H.clamp(L.zoom * Math.exp(-e.deltaY * .0015), .5, 6); }, { passive: false });
    const seg = (sel, key, fn) => H.$(sel).onclick = e => { const b = e.target.closest("button"); if (!b) return; H.$$(sel + " button").forEach(x => x.classList.toggle("on", x === b)); fn(b.dataset.k || b.dataset.v); };
    seg("#lab-color", "color", v => { L.color = v; colorize(); legend(); });
    seg("#lab-rf", "rf", v => { L.rf = v; H.$("#lab-k-wrap").style.opacity = v === "fixed" ? 1 : .35; computeBfs(); });
    H.$("#lab-k").oninput = e => { L.K = +e.target.value; H.$("#lab-k-v").textContent = L.K; computeBfs(); };
    H.$$("[data-rel]").forEach(c => c.onchange = () => { L.rel[c.dataset.rel] = c.checked; computeBfs(); });
    H.$("#lab-pulse").onchange = e => L.pulse = e.target.checked; H.$("#lab-spin").onchange = e => L.spin = e.target.checked; H.$("#lab-gate").onchange = e => L.gate = e.target.checked; H.$("#lab-edges").onchange = e => L.edgesOn = e.target.checked;
    H.$("#lab-clear").onclick = () => { L.sel = -1; computeBfs(); };
    H.$("#lab-reroll").onclick = () => { L.seed++; setCount(L.N, "New schematic sample (seed " + L.seed + ") — same real hop & gate distributions"); };
    const sl = H.$("#lab-n"); sl.min = 0; sl.max = 1000; sl.step = 1;
    sl.oninput = () => { H.$("#lab-n-v").textContent = (Math.round(nOfSlider(+sl.value) / 2) * 2).toLocaleString(); };
    sl.onchange = () => setCount(nOfSlider(+sl.value));
    H.$("#lab-presets").onclick = e => { const b = e.target.closest("button"); if (b) setCount(+b.dataset.n); };
    seg("#lab-view", "view", v => {
      L.view = v; H.$("#lab-sim").classList.toggle("hidden", v !== "sim"); H.$("#lab-real").classList.toggle("hidden", v !== "real");
      if (v === "real") { if (!L.zvReal) { L.zvReal = new ZoomView(H.$("#real-canvas"), H.$("#real-vp"), { maxScale: 20 }); L.zvReal.setImage(H.M.images.xai.local_graph || ""); } else L.zvReal.resize(); } else sizeCanvas();
    });
  }

  H.views.graph = {
    async init() {
      try { L.hist = await H.loadHops(); } catch (e) { H.$("#view-graph").insertAdjacentHTML("afterbegin", `<div class="err">${H.esc(e.message)}</div>`); return; }
      L.canvas = H.$("#lab-canvas"); L.ctx = L.canvas.getContext("2d"); sizeCanvas(); legend(); bindControls(); gateChart(); setCount(L.N);
      H.onResize.push(() => { sizeCanvas(); if (L.zvReal) L.zvReal.resize(); });
      if (!L.running) { L.running = true; requestAnimationFrame(frame); }
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) { L.spin = false; H.$("#lab-spin").checked = false; L.pulse = false; H.$("#lab-pulse").checked = false; }
    },
    show() { if (!L.canvas) return; sizeCanvas(); if (L.hist) gateChart(); },
    key(e) { if (e.key === "Escape") { L.sel = -1; computeBfs(); } },
    setCount, _state: L,
  };
})();
