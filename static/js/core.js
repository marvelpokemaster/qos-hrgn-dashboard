/* core.js - shared state, helpers, router, tooltip, drawer, palette, boot, background */
"use strict";

const H = {
  M: null,            // manifest
  hops: null,         // hop/gate histograms (lazy)
  views: {},          // id -> {init(), show(), resize()}
  cur: null,
  REG: ["WT", "TC", "ET"],
  REG_COLOR: { WT: "#4cc9f0", TC: "#ffb300", ET: "#ff4d4d", BG: "#7fa3b3" },
  REG_NAME: { WT: "Whole tumour", TC: "Tumour core", ET: "Enhancing tumour", BG: "Background" },
  MOD: ["T1", "T1ce", "T2", "FLAIR"],
  MODEL_COLOR: { full: "#ffb300", segresnet: "#ff4d4d", cnn_only: "#a58bff", no_voxel: "#4cc9f0", graphsage_backbone: "#3ddc97", fixed_shared_hops: "#ff8f5a" },
  CLS: [null, { n: "NCR/NET", c: "#e15759", rgb: [225, 87, 89] }, { n: "Edema", c: "#59a14f", rgb: [89, 161, 79] }, { n: "Enhancing", c: "#f1ce63", rgb: [241, 206, 99] }],
};

/* ---------------------------------------------------------------- tiny DOM / format helpers */
H.$ = (s, r) => (r || document).querySelector(s);
H.$$ = (s, r) => Array.from((r || document).querySelectorAll(s));
H.esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
H.el = (tag, attrs, html) => { const e = document.createElement(tag); if (attrs) for (const k in attrs) { if (k === "class") e.className = attrs[k]; else e.setAttribute(k, attrs[k]); } if (html != null) e.innerHTML = html; return e; };
H.f = (v, d = 2) => (v == null || Number.isNaN(+v)) ? "–" : (+v).toFixed(d);
H.pct = (v, d = 2) => (v == null) ? "–" : (100 * v).toFixed(d);
H.sgn = (v, d = 2) => (v == null) ? "–" : (v > 0 ? "+" : v < 0 ? "−" : "±") + Math.abs(v).toFixed(d);
H.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
H.hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
H.rng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
H.mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;
H.quant = (sorted, q) => { if (!sorted.length) return NaN; const p = (sorted.length - 1) * q, i = Math.floor(p), r = p - i; return sorted[i] + (sorted[i + 1] !== undefined ? r * (sorted[i + 1] - sorted[i]) : 0); };
H.model = id => (H.M.models.find(m => m.id === id) || { id, label: id, short: id });
H.mlabel = id => H.model(id).label;
H.mcolor = id => H.MODEL_COLOR[id] || "#9fb7c3";
H.lb = id => H.M.leaderboard.find(r => r.experiment === id);
H.hours = s => s == null ? "–" : (s / 3600).toFixed(s >= 36000 ? 0 : 1) + " h";
H.big = v => v == null ? "–" : v >= 1e6 ? (v / 1e6).toFixed(2) + " M" : v >= 1e3 ? (v / 1e3).toFixed(1) + " k" : String(Math.round(v));
H.gb = b => b == null ? "–" : (b / 2 ** 30).toFixed(1) + " GB";
H.onResize = [];

/* ---------------------------------------------------------------- tooltip */
H.tip = {
  el: null,
  show(html, ev) { const t = this.el || (this.el = H.$("#tip")); t.innerHTML = html; t.classList.add("on"); this.move(ev); },
  move(ev) {
    const t = this.el; if (!t || !ev) return;
    const w = t.offsetWidth, h = t.offsetHeight; let x = ev.clientX + 16, y = ev.clientY + 14;
    if (x + w > innerWidth - 8) x = ev.clientX - w - 14; if (y + h > innerHeight - 8) y = ev.clientY - h - 12;
    t.style.left = Math.max(4, x) + "px"; t.style.top = Math.max(4, y) + "px";
  },
  hide() { (this.el || (this.el = H.$("#tip"))).classList.remove("on"); },
  rows(title, rows, hint) {
    return `<div class="t">${H.esc(title)}</div>` + rows.map(r => `<div class="r"><span style="${r[2] ? "color:" + r[2] : ""}">${H.esc(r[0])}</span><b>${r[1]}</b></div>`).join("") + (hint ? `<div class="h">${hint}</div>` : "");
  },
};

/* ---------------------------------------------------------------- animated counter */
H.counter = (el, to, { dec = 2, dur = 1100, suffix = "" } = {}) => {
  if (!el) return; if (matchMedia("(prefers-reduced-motion: reduce)").matches) { el.textContent = to.toFixed(dec) + suffix; return; }
  const t0 = performance.now();
  const step = t => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = (to * e).toFixed(dec) + suffix; if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
};

/* ---------------------------------------------------------------- router */
H.TABS = [
  { id: "command", n: "01", label: "Command" }, { id: "scan", n: "02", label: "Scan" }, { id: "bench", n: "03", label: "Benchmark" },
  { id: "graph", n: "04", label: "Graph lab" }, { id: "xai", n: "05", label: "Explain" }, { id: "train", n: "06", label: "Training" }, { id: "slic", n: "07", label: "SLIC" },
];
H.initTabs = () => {
  const nav = H.$("#tabs");
  nav.innerHTML = H.TABS.map(t => `<button data-t="${t.id}" title="${t.label} (${+t.n})"><i>${t.n}</i>${t.label}</button>`).join("");
  nav.addEventListener("click", e => { const b = e.target.closest("button"); if (b) H.go(b.dataset.t); });
  addEventListener("hashchange", () => { const id = location.hash.replace("#", ""); if (H.views[id] && id !== H.cur) H.go(id, true); });
};
H.go = (id, fromHash) => {
  if (!H.views[id]) return;
  H.$$("nav.tabs button").forEach(b => b.classList.toggle("active", b.dataset.t === id));
  H.$$(".view").forEach(v => v.classList.toggle("active", v.id === "view-" + id));
  const v = H.views[id]; if (!v._ready) { v._ready = true; try { const r = v.init && v.init(); if (r && r.catch) r.catch(e => H.fail(id, e)); } catch (e) { H.fail(id, e); } }
  H.cur = id; if (!fromHash) { try { history.replaceState(null, "", "#" + id); } catch (e) { /* file:// etc. */ } }
  requestAnimationFrame(() => { try { v.show && v.show(); } catch (e) { H.fail(id, e); } });
  scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
};
H.fail = (id, e) => { console.error("[" + id + "]", e); const b = H.$("#view-" + id); if (b) b.insertAdjacentHTML("afterbegin", `<div class="err">Module "${H.esc(id)}" failed: ${H.esc(e.message || e)}</div>`); };
addEventListener("resize", () => { clearTimeout(H._rt); H._rt = setTimeout(() => { H.onResize.forEach(f => { try { f(); } catch (e) { console.error(e); } }); }, 120); });

/* ---------------------------------------------------------------- data */
H.load = async () => {
  const get = async u => { const r = await fetch(u, { cache: "no-cache" }); if (!r.ok) throw new Error(u + " -> HTTP " + r.status); return r.json(); };
  H.M = await get("/api/manifest");
  if (H.M.schema !== 2) throw new Error("manifest.json is from an older version - run: python extract_and_prepare.py");
};
H.loadHops = async () => {
  if (H.hops) return H.hops;
  const r = await fetch("/data/hops.json"); if (!r.ok) throw new Error("hops.json missing - run extract_and_prepare.py");
  return (H.hops = await r.json());
};

/* ---------------------------------------------------------------- patient drawer */
H.caseHasPanels = cid => { const q = H.M.qualitative.cases.find(c => c.case_id === cid); return q && (q.panels || q.montage) ? q : null; };
H.patientRank = (cid, model, k) => {   // rank of this patient's value among all test patients (1 = best)
  const idx = H.M.patients.cols.indexOf(k), all = Object.values(H.M.patients.rows).map(r => r[model] && r[model][idx]).filter(v => v != null);
  const v = H.M.patients.rows[cid][model][idx], higher = k.startsWith("Dice");
  return 1 + all.filter(x => higher ? x > v : x < v).length;
};
H.openPatient = cid => {
  const rows = H.M.patients.rows[cid]; if (!rows) return;
  const d = H.$("#drawer"), cols = H.M.patients.cols, q = H.caseHasPanels(cid);
  const ordered = H.M.models.map(m => m.id).filter(id => rows[id]);
  const dice = id => cols.slice(0, 3).map((_, i) => rows[id][i]), mean = id => H.mean(dice(id));
  const best = Math.max(...ordered.map(mean));
  let html = `<div class="row" style="justify-content:space-between"><div><div class="faint mono" style="font-size:11px;letter-spacing:.2em">PATIENT RECORD</div><h2>${H.esc(cid)}</h2></div><button class="iconbtn" id="dr-x">Close ×</button></div>`;
  if (q) html += `<div class="note">Rendered slice available: <b>${H.esc(q.reason || "")}</b></div><div class="row" style="margin:8px 0"><button class="iconbtn" id="dr-open">Open in scan viewer</button></div>`;
  else html += `<div class="note warn">No rendered slice was saved for this patient (the notebook stores 10 qualitative cases). Metrics below cover the full 3D volume.</div>`;
  html += `<div style="margin-top:12px"><div class="mrow head"><span>Model</span><span class="n">WT</span><span class="n">TC</span><span class="n">ET</span><span class="n">mean</span></div>`;
  ordered.forEach(id => { const dv = dice(id), mn = mean(id); html += `<div class="mrow"><span style="color:${H.mcolor(id)}">${H.esc(H.model(id).short)}</span>${dv.map(v => `<span class="n">${H.pct(v, 1)}</span>`).join("")}<span class="n" style="color:${mn === best ? "var(--gold)" : "#fff"}">${H.pct(mn, 1)}</span></div>`; });
  html += `</div><div style="margin-top:14px"><div class="mrow head"><span>HD95 (mm)</span><span class="n">WT</span><span class="n">TC</span><span class="n">ET</span><span class="n"></span></div>`;
  ordered.forEach(id => { html += `<div class="mrow"><span style="color:${H.mcolor(id)}">${H.esc(H.model(id).short)}</span>${[3, 4, 5].map(i => `<span class="n">${H.f(rows[id][i], 1)}</span>`).join("")}<span></span></div>`; });
  html += `</div>`;
  const f = rows.full; if (f) html += `<div class="note">Ranks for QoS-HRGN among ${Object.keys(H.M.patients.rows).length} patients — Dice WT <b>#${H.patientRank(cid, "full", "Dice_WT")}</b> · TC <b>#${H.patientRank(cid, "full", "Dice_TC")}</b> · ET <b>#${H.patientRank(cid, "full", "Dice_ET")}</b>.${f[2] === 0 ? " ET Dice is 0 here (small or absent enhancing region)." : ""}</div>`;
  d.innerHTML = html; d.classList.add("on");
  H.$("#dr-x").onclick = H.closePatient;
  const ob = H.$("#dr-open"); if (ob) ob.onclick = () => { H.closePatient(); H.go("scan"); H.views.scan.select(cid); };
};
H.closePatient = () => H.$("#drawer").classList.remove("on");

/* ---------------------------------------------------------------- modal (image lightbox) */
H.openModal = (title, src) => {
  const m = H.$("#modal"); m.classList.add("on"); H.$("#modal-title").textContent = title;
  const vp = H.$("#modal .viewport");
  if (!H._modalZV) H._modalZV = new ZoomView(H.$("#modal-canvas"), vp);
  H._modalZV.setImage(src); requestAnimationFrame(() => H._modalZV.fit());
};
H.closeModal = () => H.$("#modal").classList.remove("on");

/* ---------------------------------------------------------------- command palette */
H.palette = {
  items: [], sel: 0,
  open() { const p = H.$("#palette"); p.classList.add("on"); const i = H.$("#pal-in"); i.value = ""; this.render(""); i.focus(); },
  close() { H.$("#palette").classList.remove("on"); },
  render(q) {
    q = q.trim().toLowerCase();
    const mods = H.TABS.map(t => ({ k: "module", l: t.label, a: () => H.go(t.id) }));
    const ids = Object.keys(H.M.patients.rows).map(c => ({ k: "patient", l: c, a: () => H.openPatient(c) }));
    const all = mods.concat(ids);
    this.items = (q ? all.filter(i => i.l.toLowerCase().includes(q)) : all.slice(0, 9)).slice(0, 40); this.sel = 0;
    H.$("#pal-list").innerHTML = this.items.map((it, i) => `<li data-i="${i}" class="${i === 0 ? "on" : ""}"><span>${H.esc(it.l)}</span><span class="faint">${it.k}</span></li>`).join("") || `<li class="faint">no match</li>`;
  },
  run(i) { const it = this.items[i]; if (it) { this.close(); it.a(); } },
};

/* ---------------------------------------------------------------- keyboard */
H.initKeys = () => {
  H.$("#modal-close").onclick = H.closeModal;
  H.$("#pal-in").addEventListener("input", e => H.palette.render(e.target.value));
  H.$("#pal-list").addEventListener("click", e => { const li = e.target.closest("li[data-i]"); if (li) H.palette.run(+li.dataset.i); });
  H.$("#palette").addEventListener("mousedown", e => { if (e.target.id === "palette") H.palette.close(); });
  H.$("#pal-in").addEventListener("keydown", e => {
    const p = H.palette, n = p.items.length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); p.sel = (p.sel + (e.key === "ArrowDown" ? 1 : n - 1)) % Math.max(n, 1); H.$$("#pal-list li").forEach((li, i) => li.classList.toggle("on", i === p.sel)); }
    else if (e.key === "Enter") p.run(p.sel); else if (e.key === "Escape") p.close();
  });
  addEventListener("keydown", e => {
    const tag = (e.target.tagName || "").toLowerCase(); if (tag === "input" || tag === "select" || tag === "textarea") return;
    if (e.ctrlKey || e.metaKey || e.altKey) { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); H.palette.open(); } return; }
    if (e.key === "Escape") { H.closeModal(); H.closePatient(); H.palette.close(); return; }
    if (e.key === "/") { e.preventDefault(); H.palette.open(); return; }
    if (/^[1-7]$/.test(e.key)) { H.go(H.TABS[+e.key - 1].id); return; }
    if (e.key === "f" || e.key === "F") { document.body.classList.toggle("present"); H.onResize.forEach(f => f()); return; }
    if (e.key === "?") { H.toast("Keys: 1-7 modules · / find patient · F presentation · Scan: ←/→ case, O/G/S mode, B blink, 0 reset · Graph: drag rotate"); return; }
    const v = H.views[H.cur]; if (v && v.key) v.key(e);
  });
};
H.toast = msg => { let t = H.$("#toast"); if (!t) { t = H.el("div", { id: "toast" }); t.style.cssText = "position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:250;background:rgba(2,12,22,.96);border:1px solid var(--arc);padding:9px 16px;font-family:var(--font-mono);font-size:12.5px;max-width:92vw;box-shadow:0 0 22px rgba(92,243,255,.3)"; document.body.appendChild(t); } t.textContent = msg; t.style.display = "block"; clearTimeout(t._h); t._h = setTimeout(() => t.style.display = "none", 5200); };

/* ---------------------------------------------------------------- boot sequence */
H.boot = async () => {
  const boot = H.$("#boot"), log = H.$("#boot-log"), bar = H.$("#boot-bar");
  const quick = matchMedia("(prefers-reduced-motion: reduce)").matches || /nobo+t/.test(location.search) || sessionStorageGet("hud-booted");
  let skip = quick; const onkey = () => { skip = true; }; addEventListener("keydown", onkey, { once: true }); boot.addEventListener("click", onkey, { once: true });
  const lines = [["Initialising arc-reactor core", 0], ["Mounting verified test artefacts", 1], ["Indexing patients, models, graphs", 2], ["Calibrating Shapley + hop telemetry", 3], ["All systems nominal", 4]];
  const done = H.load().catch(e => e);
  let i = 0;
  for (const [t, k] of lines) {
    if (skip) break; log.innerHTML += `> ${t} ... <span class="ok">ok</span>\n`; bar.style.width = ((k + 1) / lines.length * 100) + "%";
    await new Promise(r => setTimeout(r, 330)); i++;
  }
  const res = await done; sessionStorageSet("hud-booted", "1");
  boot.classList.add("out"); setTimeout(() => boot.remove(), 700);
  if (res instanceof Error) throw res;
};
function sessionStorageGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
function sessionStorageSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* private mode */ } }

/* ---------------------------------------------------------------- ambient background (cheap, pausable) */
H.initBg = () => {
  const c = H.$("#bg"), g = c.getContext("2d"); if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  let W = 0, Hh = 0, pts = [], last = 0;
  const size = () => { const d = Math.min(devicePixelRatio || 1, 1.5); W = c.width = innerWidth * d; Hh = c.height = innerHeight * d; g.setTransform(d, 0, 0, d, 0, 0); pts = Array.from({ length: Math.round(innerWidth * innerHeight / 22000) }, () => ({ x: Math.random() * innerWidth, y: Math.random() * innerHeight, vx: (Math.random() - .5) * .12, vy: (Math.random() - .5) * .12 })); };
  size(); addEventListener("resize", size);
  const hex = (x, y, r) => { g.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 3 * k + Math.PI / 6; g.lineTo(x + r * Math.cos(a), y + r * Math.sin(a)); } g.closePath(); g.stroke(); };
  const frame = t => {
    requestAnimationFrame(frame); if (document.hidden || t - last < 40) return; last = t;
    const w = innerWidth, h = innerHeight; g.clearRect(0, 0, w, h);
    g.strokeStyle = "rgba(76,201,240,.045)"; g.lineWidth = 1; const r = 46, dx = r * Math.sqrt(3), dy = r * 1.5;
    for (let row = -1; row * dy < h + dy; row++) for (let col = -1; col * dx < w + dx; col++) hex(col * dx + (row & 1 ? dx / 2 : 0), row * dy, r - 1);
    g.fillStyle = "rgba(92,243,255,.55)";
    for (const p of pts) { p.x += p.vx; p.y += p.vy; if (p.x < 0) p.x = w; if (p.x > w) p.x = 0; if (p.y < 0) p.y = h; if (p.y > h) p.y = 0; g.fillRect(p.x, p.y, 1.6, 1.6); }
    g.strokeStyle = "rgba(92,243,255,.07)";
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) { const a = pts[i], b = pts[j], d2 = (a.x - b.x) ** 2 + (a.y - b.y) ** 2; if (d2 < 9000) { g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); } }
  };
  requestAnimationFrame(frame);
};
