/* scan.js - 02 SCAN: PACS-style viewport. Overlay / grid / swipe on the real saved slices.
   The research notebook saves one montage per case (T1ce, reference, graph-only, graph+voxel, error).
   extract_and_prepare.py cuts it into five aligned panels so they can be composited here. */
"use strict";

(() => {
  const NAMES = ["T1ce", "Reference", "Graph only", "Graph + voxel", "Prediction error"];
  const LAYERS = [[1, "Reference"], [2, "Graph only"], [3, "Graph + voxel (QoS-HRGN)"]];
  const S = { idx: 0, mode: "overlay", a: 3, b: 1, opacity: .7, bri: 100, con: 100, inv: false, err: true, hidden: new Set(), swipe: .5, blink: null, cursor: null, panels: [], maps: [], base: null, overlays: {}, errMask: null, pw: 0, ph: 0, zv: null, ready: false, gen: 0 };

  const caseObj = () => H.M.qualitative.cases[S.idx];
  const cells = () => {
    const w = S.zv.w, h = S.zv.h, g = 6;
    if (S.mode === "grid") { const cw = (w - 2 * g) / 3, ch = (h - g) / 2; return [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]].map(([c, r], i) => ({ ox: c * (cw + g), oy: r * (ch + g), w: cw, h: ch, kind: i < 5 ? "raw" : "overlay", p: i })); }
    return [{ ox: 0, oy: 0, w, h, kind: S.mode }];
  };

  function classify(img) {            // -> Uint8Array class map (0 bg, 1 ncr, 2 ed, 3 et) and error mask
    const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight; const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data, out = new Uint8Array(c.width * c.height);
    for (let i = 0; i < out.length; i++) {
      const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2]; if (r + gg + b < 70) continue;
      let best = 0, bd = 1e9; for (let k = 1; k <= 3; k++) { const q = H.CLS[k].rgb, dd = (r - q[0]) ** 2 + (gg - q[1]) ** 2 + (b - q[2]) ** 2; if (dd < bd) { bd = dd; best = k; } }
      out[i] = bd < 9000 ? best : 0;
    }
    return out;
  }
  function errMask(img) {
    const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight; const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data, out = new Uint8Array(c.width * c.height);
    for (let i = 0; i < out.length; i++) out[i] = d[i * 4] < 170 && d[i * 4 + 1] < 90 ? 1 : 0;   // dark red of the 'Reds' map
    return out;
  }
  function buildBase() {
    const img = S.panels[0]; if (!img) return; const c = S.base || (S.base = document.createElement("canvas")); c.width = S.pw; c.height = S.ph;
    const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(img, 0, 0); const id = g.getImageData(0, 0, c.width, c.height), d = id.data;
    const lut = new Uint8Array(256); for (let v = 0; v < 256; v++) { let x = ((v * S.bri / 100) - 128) * S.con / 100 + 128; x = H.clamp(x, 0, 255); lut[v] = S.inv ? 255 - x : x; }
    for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; }
    g.putImageData(id, 0, 0);
  }
  function overlayCanvas(p) {          // class colours for panel p (1..3), honouring hidden classes
    const key = p + "|" + [...S.hidden].sort().join(""); if (S.overlays[key]) return S.overlays[key];
    const c = document.createElement("canvas"); c.width = S.pw; c.height = S.ph; const g = c.getContext("2d"), id = g.createImageData(S.pw, S.ph), m = S.maps[p];
    for (let i = 0; i < m.length; i++) { const k = m[i]; if (!k || S.hidden.has(k)) continue; const rgb = H.CLS[k].rgb; id.data[i * 4] = rgb[0]; id.data[i * 4 + 1] = rgb[1]; id.data[i * 4 + 2] = rgb[2]; id.data[i * 4 + 3] = 255; }
    g.putImageData(id, 0, 0); return (S.overlays[key] = c);
  }
  function errCanvas() {
    if (S.errC) return S.errC; const c = document.createElement("canvas"); c.width = S.pw; c.height = S.ph; const g = c.getContext("2d"), id = g.createImageData(S.pw, S.ph);
    for (let i = 0; i < S.errMask.length; i++) if (S.errMask[i]) { id.data[i * 4] = 92; id.data[i * 4 + 1] = 243; id.data[i * 4 + 2] = 255; id.data[i * 4 + 3] = 255; }
    g.putImageData(id, 0, 0); return (S.errC = c);
  }

  function drawComposite(g, layer) {
    g.drawImage(S.base, 0, 0);
    g.globalAlpha = S.opacity; g.drawImage(overlayCanvas(layer), 0, 0); g.globalAlpha = 1;
    if (S.err) { g.globalAlpha = .9; g.drawImage(errCanvas(), 0, 0); g.globalAlpha = 1; }
  }

  function draw(g, v, zv) {
    if (!S.ready) { g.fillStyle = "#5cf3ff"; g.font = "13px monospace"; g.fillText("loading slice…", 14, 24); return; }
    const cs = cells(); g.imageSmoothingEnabled = v.s < 1.2;
    cs.forEach(c => {
      g.save(); g.beginPath(); g.rect(c.ox, c.oy, c.w, c.h); g.clip(); g.fillStyle = "#000"; g.fillRect(c.ox, c.oy, c.w, c.h);
      g.translate(c.ox + v.x, c.oy + v.y); g.scale(v.s, v.s); g.imageSmoothingEnabled = v.s < 1.2;
      if (c.kind === "overlay") drawComposite(g, S.blink ? (S.blink.on ? S.a : S.b) : S.a);
      else if (c.kind === "raw") g.drawImage(S.panels[c.p], 0, 0);
      else if (c.kind === "swipe") {
        drawComposite(g, S.a); const x = (S.swipe * c.w - v.x) / v.s; g.save(); g.beginPath(); g.rect(x, -1e4, 1e5, 2e4); g.clip(); drawComposite(g, S.b); g.restore();
      }
      g.restore();
      // cell chrome
      g.save(); g.strokeStyle = "rgba(92,243,255,.35)"; g.strokeRect(c.ox + .5, c.oy + .5, c.w - 1, c.h - 1);
      g.fillStyle = "#5cf3ff"; g.font = "600 11px 'Share Tech Mono', Consolas, monospace";
      let label = c.kind === "raw" ? NAMES[c.p] : c.kind === "swipe" ? NAMES[S.a] + "  ◂ ▸  " + NAMES[S.b] : (S.blink ? NAMES[S.blink.on ? S.a : S.b] : NAMES[S.a]) + (S.err ? " + errors" : "") + " on T1ce";
      if (c.kind === "overlay" && S.mode === "grid") label = NAMES[S.a] + " overlay";
      g.shadowColor = "#000"; g.shadowBlur = 4; g.fillText(label.toUpperCase(), c.ox + 8, c.oy + 16);
      if (c.kind === "swipe") { const x = c.ox + S.swipe * c.w; g.strokeStyle = "#ffb300"; g.lineWidth = 2; g.beginPath(); g.moveTo(x, c.oy); g.lineTo(x, c.oy + c.h); g.stroke(); g.fillStyle = "#ffb300"; g.beginPath(); g.arc(x, c.oy + c.h / 2, 8, 0, 6.3); g.fill(); g.fillStyle = "#000"; g.fillText("↔", x - 6, c.oy + c.h / 2 + 4); }
      // reticle
      if (S.cursor && S.cursor.cell === c) { g.strokeStyle = "rgba(255,179,0,.8)"; g.lineWidth = 1; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(S.cursor.px, c.oy); g.lineTo(S.cursor.px, c.oy + c.h); g.moveTo(c.ox, S.cursor.py); g.lineTo(c.ox + c.w, S.cursor.py); g.stroke(); g.setLineDash([]); }
      g.restore();
    });
    const sc = v.s / zv.fitScale; H.$("#scan-hud-tl").textContent = `${caseObj().case_id} · ${NAMES[S.mode === "grid" ? 0 : S.a]}${S.mode === "grid" ? " grid" : ""} · zoom ${sc.toFixed(1)}×`;
  }

  function readout(lx, ly, ev, zv) {
    const c = cells().find(c => lx >= 0 && ly >= 0 && lx <= c.w && ly <= c.h) || cells()[0], v = zv.view;
    const ix = Math.floor((lx - v.x) / v.s), iy = Math.floor((ly - v.y) / v.s), inside = ix >= 0 && iy >= 0 && ix < S.pw && iy < S.ph;
    const r = zv.pos(ev); S.cursor = { cell: c, px: r.x, py: r.y }; zv.draw();
    const hud = H.$("#scan-hud-br");
    if (!inside) { hud.innerHTML = ""; return; }
    const i = iy * S.pw + ix, cl = p => { const k = S.maps[p][i]; return k ? `<span style="color:${H.CLS[k].c}">${H.CLS[k].n}</span>` : "<span class='dim'>background</span>"; };
    hud.innerHTML = `x ${ix} · y ${iy}<br>REF ${cl(1)}<br>GRAPH ${cl(2)}<br>G+V ${cl(3)}<br>${S.errMask[i] ? '<span style="color:#5cf3ff">G+V ≠ reference</span>' : '<span class="dim">G+V = reference</span>'}`;
  }

  function loadCase(i) {
    S.idx = H.clamp(i, 0, H.M.qualitative.cases.length - 1); const c = caseObj(); S.ready = false; S.overlays = {}; S.errC = null; const gen = ++S.gen;
    H.$$("#caselist .case").forEach((b, k) => b.classList.toggle("on", k === S.idx));
    H.$("#scan-title").textContent = c.case_id; H.$("#scan-sub").textContent = c.reason || "";
    H.$("#case-h").textContent = "Metrics · " + c.case_id; renderMetrics(c.case_id);
    if (!c.panels) { H.$("#scan-note").innerHTML = "Panels could not be cut from the montage (install Pillow and numpy, then run <span class='mono'>python extract_and_prepare.py</span>). Showing the full saved montage."; S.zv.setImage(c.montage); S.zv.o.draw = null; return; }
    S.zv.o.draw = draw;
    H.$("#scan-note").innerHTML = "<b>One axial slice, chosen from the reference for display only</b> — inference ran on the whole 3D volume and the metrics at right are full-volume. The case set is a descriptive selection (" + H.esc(H.M.qualitative.policy || "") + ").";
    let left = 5; const imgs = [];
    c.panels.forEach((u, k) => { const im = new Image(); im.onload = () => { imgs[k] = im; if (--left === 0 && gen === S.gen) finish(imgs); }; im.onerror = () => { if (gen === S.gen) H.$("#scan-note").textContent = "Could not load panel " + u; }; im.src = u; });
  }
  function finish(imgs) {
    S.panels = imgs; S.pw = imgs[0].naturalWidth; S.ph = imgs[0].naturalHeight; S.maps = imgs.map((im, k) => (k >= 1 && k <= 3) ? classify(im) : null); S.errMask = errMask(imgs[4]);
    buildBase(); S.ready = true; S.zv.o.content = () => ({ w: S.pw, h: S.ph }); S.zv.fit();
  }

  function renderMetrics(cid) {
    const rows = H.M.patients.rows[cid]; if (!rows) { H.$("#case-metrics").innerHTML = "<div class='dim'>no metrics</div>"; return; }
    const ids = H.M.models.map(m => m.id).filter(id => rows[id]);
    H.$("#case-metrics").innerHTML = `<div class="mrow head"><span>Dice %</span><span class="n">WT</span><span class="n">TC</span><span class="n">ET</span><span class="n">HD95 ET</span></div>` +
      ids.map(id => `<div class="mrow"><span style="color:${H.mcolor(id)}">${H.esc(H.model(id).short)}</span>${[0, 1, 2].map(i => `<span class="n">${H.pct(rows[id][i], 1)}</span>`).join("")}<span class="n">${H.f(rows[id][5], 1)}</span></div>`).join("") +
      `<div class="row" style="margin-top:10px"><button class="iconbtn" id="case-rec">Full record &amp; ranks</button></div>`;
    H.$("#case-rec").onclick = () => H.openPatient(cid);
    H.$("#case-note").innerHTML = "Volume-level metrics for this patient (all slices). HD95 in mm. Dice 0 for ET usually means a small or absent enhancing region.";
  }

  function setMode(m) {
    S.mode = m; H.$$("#scan-mode button").forEach(b => b.classList.toggle("on", b.dataset.m === m));
    H.$("#scan-b").style.display = H.$("#scan-b-lbl").style.display = m === "swipe" ? "" : "none";
    let sw = H.$("#swipe-range"); if (sw) sw.style.display = m === "swipe" ? "" : "none";
    if (S.zv && S.ready) S.zv.fit();
  }
  function toggleBlink() {
    if (S.blink) { clearInterval(S.blink.t); S.blink = null; H.toast("Blink off"); } else { S.blink = { on: true, t: setInterval(() => { S.blink.on = !S.blink.on; S.zv.draw(); }, 650) }; H.toast("Blinking " + NAMES[S.a] + " ↔ " + NAMES[S.b] + " (B to stop)"); if (S.mode !== "overlay") setMode("overlay"); }
    S.zv.draw();
  }

  H.views.scan = {
    init() {
      const cs = H.M.qualitative.cases; if (!cs.length) { H.$("#view-scan").innerHTML = "<div class='err'>No qualitative cases in the manifest.</div>"; return; }
      const vp = H.$("#scan-vp");
      S.zv = new ZoomView(H.$("#scan-canvas"), vp, { draw, minScale: .6, maxScale: 30, cellAt: (px, py) => cells().find(c => px >= c.ox && py >= c.oy && px <= c.ox + c.w && py <= c.oy + c.h) || cells()[0], onMove: readout, onLeave() { S.cursor = null; H.$("#scan-hud-br").innerHTML = ""; S.zv.draw(); } });
      const opts = LAYERS.map(l => `<option value="${l[0]}">${l[1]}</option>`).join(""); H.$("#scan-a").innerHTML = opts; H.$("#scan-b").innerHTML = opts; H.$("#scan-a").value = S.a; H.$("#scan-b").value = S.b;
      H.$("#scan-a").onchange = e => { S.a = +e.target.value; S.zv.draw(); }; H.$("#scan-b").onchange = e => { S.b = +e.target.value; S.zv.draw(); };
      H.$("#scan-classes").innerHTML = [1, 2, 3].map(k => `<label><input type="checkbox" checked data-k="${k}" style="accent-color:${H.CLS[k].c}"><i style="background:${H.CLS[k].c}"></i>${H.CLS[k].n}</label>`).join("") + `<label><i style="background:#5cf3ff"></i>error</label>`;
      H.$("#scan-classes").onchange = e => { const k = +e.target.dataset.k; if (!k) return; e.target.checked ? S.hidden.delete(k) : S.hidden.add(k); S.zv.draw(); };
      H.$("#scan-mode").onclick = e => { const b = e.target.closest("button"); if (b) setMode(b.dataset.m); };
      H.$("#scan-reset").onclick = () => S.zv.fit();
      const sw = H.el("input", { type: "range", id: "swipe-range", min: 2, max: 98, value: 50 }); sw.style.cssText = "position:absolute;left:5%;right:5%;bottom:30px;width:90%;display:none"; sw.oninput = () => { S.swipe = sw.value / 100; S.zv.draw(); }; vp.appendChild(sw);
      const bind = (id, fn, out) => { H.$(id).oninput = e => { fn(+e.target.value, e.target.checked); if (out) H.$(out).textContent = e.target.value; }; };
      bind("#s-bri", v => { S.bri = v; buildBase(); S.zv.draw(); }, "#v-bri"); bind("#s-con", v => { S.con = v; buildBase(); S.zv.draw(); }, "#v-con"); bind("#s-opa", v => { S.opacity = v / 100; S.zv.draw(); }, "#v-opa");
      H.$("#s-inv").onchange = e => { S.inv = e.target.checked; buildBase(); S.zv.draw(); }; H.$("#s-err").onchange = e => { S.err = e.target.checked; S.zv.draw(); };
      H.$("#caselist").innerHTML = cs.map((c, i) => `<button class="case" data-i="${i}"><img alt="" src="${c.panels ? c.panels[0] : c.montage}" loading="lazy"><div><div class="id">${H.esc(c.case_id)}</div><div class="why">${H.esc(c.reason || "")}</div></div></button>`).join("");
      H.$("#caselist").onclick = e => { const b = e.target.closest(".case"); if (b) loadCase(+b.dataset.i); };
      const find = H.el("div", { class: "row" }, `<input class="inp" id="case-find" list="all-cases" placeholder="Any of ${Object.keys(H.M.patients.rows).length} patients…" style="flex:1"><datalist id="all-cases">${Object.keys(H.M.patients.rows).sort().map(c => `<option value="${c}">`).join("")}</datalist>`);
      H.$("#caselist").parentElement.insertBefore(find, H.$("#caselist")); find.style.marginBottom = "10px";
      find.querySelector("input").addEventListener("change", e => { const v = e.target.value.trim(); const id = Object.keys(H.M.patients.rows).find(c => c === v || c.endsWith(v)); if (id) H.views.scan.select(id); });
      H.$("#case-policy").textContent = H.M.qualitative.policy || "";
      setMode("overlay"); loadCase(0); H.onResize.push(() => S.zv && S.zv.resize());
    },
    show() { if (S.zv) { S.zv.resize(); } },
    select(cid) { const i = H.M.qualitative.cases.findIndex(c => c.case_id === cid); if (i >= 0) { if (!S.zv) return; loadCase(i); } else H.openPatient(cid); },
    key(e) {
      const n = H.M.qualitative.cases.length, k = e.key.toLowerCase();
      if (e.key === "ArrowRight" || e.key === "]") loadCase((S.idx + 1) % n); else if (e.key === "ArrowLeft" || e.key === "[") loadCase((S.idx + n - 1) % n);
      else if (k === "o") setMode("overlay"); else if (k === "g") setMode("grid"); else if (k === "s") setMode("swipe"); else if (k === "b") toggleBlink();
      else if (e.key === "0") S.zv.fit(); else if (e.key === "+" || e.key === "=") S.zv.zoomCentre(1.25); else if (e.key === "-") S.zv.zoomCentre(.8);
    },
    _state: S,
  };
})();
