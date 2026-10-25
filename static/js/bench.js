/* bench.js - 03 BENCHMARK: sortable leaderboard, grouped bars, paired CI forest, patient strip + paired scatter, cost table */
"use strict";

(() => {
  const B = { sort: { k: "mean", dir: -1 }, ref: "full", delta: true, bar: "Dice", sd: false, barHidden: new Set(), forest: "Dice_mean", stripModel: "full", stripMetric: "Dice", scX: "segresnet", scY: "full", scR: "ET" };
  const COLS = [
    { k: "Dice_WT", label: "WT Dice", pct: true, hi: true, c: H.REG_COLOR.WT }, { k: "Dice_TC", label: "TC Dice", pct: true, hi: true, c: H.REG_COLOR.TC }, { k: "Dice_ET", label: "ET Dice", pct: true, hi: true, c: H.REG_COLOR.ET },
    { k: "mean", label: "Mean Dice", pct: true, hi: true, c: "#fff" },
    { k: "HD95_WT", label: "WT HD95", hi: false }, { k: "HD95_TC", label: "TC HD95", hi: false }, { k: "HD95_ET", label: "ET HD95", hi: false },
  ];
  const val = (r, k) => k === "mean" ? H.mean(["WT", "TC", "ET"].map(x => r["Dice_" + x + "_mean"])) : r[k + "_mean"];
  const sdv = (r, k) => k === "mean" ? null : r[k + "_patient_sd"];

  function table() {
    const rows = H.M.leaderboard.slice(), ref = H.lb(B.ref), dir = B.sort.dir;
    rows.sort((a, b) => dir * ((val(a, B.sort.k) ?? 0) - (val(b, B.sort.k) ?? 0)));
    const best = {}; COLS.forEach(c => { const v = H.M.leaderboard.map(r => val(r, c.k)); best[c.k] = c.hi ? Math.max(...v) : Math.min(...v); });
    const head = `<thead><tr><th>Model</th>${COLS.map(c => `<th class="sortable" data-k="${c.k}" style="color:${c.c || ""}">${c.label}${B.sort.k === c.k ? `<span class="arr">${dir < 0 ? "▼" : "▲"}</span>` : ""}</th>`).join("")}</tr></thead>`;
    const body = rows.map(r => {
      const m = H.model(r.experiment), ours = r.experiment === "full";
      const cells = COLS.map(c => {
        const v = val(r, c.k), isBest = Math.abs(v - best[c.k]) < 1e-12, txt = c.pct ? H.pct(v, 2) : H.f(v, 2);
        let d = ""; if (B.delta && ref && r.experiment !== B.ref) { const dv = c.pct ? (v - val(ref, c.k)) * 100 : v - val(ref, c.k), good = c.hi ? dv > 0 : dv < 0; d = ` <span class="delta ${Math.abs(dv) < 0.005 ? "flat" : good ? "up" : "down"}">${H.sgn(dv, 2)}</span>`; }
        const sd = sdv(r, c.k);
        return `<td class="num ${isBest ? "best" : ""}" data-tip="${sd != null ? "±" + (c.pct ? H.pct(sd, 2) : H.f(sd, 2)) + " patient SD" : ""}">${txt}${d}</td>`;
      }).join("");
      return `<tr data-id="${r.experiment}" class="${B.stripModel === r.experiment ? "sel" : ""}"><td><span style="color:${H.mcolor(r.experiment)};font-weight:700">${H.esc(m.label)}</span> ${ours ? '<span class="tag ours">ours</span>' : `<span class="tag">${H.esc(m.family)}</span>`}</td>${cells}</tr>`;
    }).join("");
    H.$("#bench-table").innerHTML = head + `<tbody>${body}</tbody>`;
  }

  function bars() {
    const k = B.bar, M = H.M, ids = M.leaderboard.map(r => r.experiment), regs = H.REG;
    const ser = regs.map(g => ({ id: g, name: g + " — " + H.REG_NAME[g], color: H.REG_COLOR[g], values: ids.map(id => H.lb(id)[k + "_" + g + "_mean"]), err: B.sd ? ids.map(id => H.lb(id)[k + "_" + g + "_patient_sd"]) : null }));
    const isHd = k === "HD95", all = ser.flatMap(s => s.values), hi = Math.max(...all);
    C.legend(H.$("#bar-legend"), ser.map(s => ({ id: s.id, name: s.name, color: s.color })), B.barHidden, bars);
    C.bars(H.$("#chart-bars"), {
      cats: ids.map(id => ({ label: H.model(id).short })), series: ser, hidden: B.barHidden, min: isHd ? 0 : .6, max: isHd ? Math.ceil(hi * 1.2) : 1, yLabel: isHd ? "HD95 (mm)" : k + (isHd ? "" : " (axis from 0.60)"),
      fmt: v => isHd ? C.txt(v, 1) : (v * 100).toFixed(v >= 1 ? 0 : 1).replace(/\.0$/, ""),
      tip: (ci, se) => { const id = ids[ci], r = H.lb(id), g = se.id; return H.tip.rows(H.mlabel(id) + " · " + g, [[k, isHd ? H.f(r[k + "_" + g + "_mean"], 2) + " mm" : H.pct(r[k + "_" + g + "_mean"], 2) + " %", se.color], ["patient SD", isHd ? H.f(r[k + "_" + g + "_patient_sd"], 2) : H.pct(r[k + "_" + g + "_patient_sd"], 2)]]); },
    });
  }

  const COMP_LABELS = { no_voxel: "QoS-HRGN − graph only", cnn_only: "QoS-HRGN − CNN only", segresnet: "QoS-HRGN − SegResNet", graphsage_backbone: "graph-only HGT − GraphSAGE", fixed_shared_hops: "graph-only HGT − fixed 2-hop" };
  function forest() {
    const m = B.forest, rows = [], vf = H.M.comparisons.vs_full.rows, go = H.M.comparisons.graph_only.rows;
    ["no_voxel", "cnn_only", "segresnet"].forEach(c => { const d = vf[c] && vf[c][m]; if (d) rows.push({ label: COMP_LABELS[c], diff: d.diff, lo: d.ci[0], hi: d.ci[1], d, id: c }); });
    ["graphsage_backbone", "fixed_shared_hops"].forEach(c => { const d = go[c] && go[c][m]; if (d) rows.push({ label: COMP_LABELS[c], diff: d.diff, lo: d.ci[0], hi: d.ci[1], d, id: c }); });
    C.forest(H.$("#chart-forest"), { rows, xLabel: "Δ " + m.replace("_", " ") + " (patient bootstrap 95% CI)", fmt: v => C.txt(v, 3), tip: r => H.tip.rows(r.label, [["difference", H.sgn(r.diff, 4)], ["95% CI", `${H.f(r.lo, 4)} … ${H.f(r.hi, 4)}`], ["sign-flip p", r.d.p == null ? "–" : H.f(r.d.p, 4)], ["Holm-adjusted p", r.d.holm == null ? "–" : H.f(r.d.holm, 4)]], r.lo > 0 || r.hi < 0 ? "CI excludes 0" : "CI includes 0 — not distinguishable") });
    const vfm = H.M.comparisons.vs_full;
    H.$("#forest-note").innerHTML = `Gold = CI excludes 0. First three rows use QoS-HRGN as reference, last two use the graph-only HGT. ${H.esc(vfm.ci_scope || "")}. n = ${vfm.n_patients}.`;
  }

  const PI = (k) => H.M.patients.cols.indexOf(k);
  function strip() {
    const id = B.stripModel, hd = B.stripMetric === "HD95", cap = 40, groups = H.REG.map(g => ({
      key: g, label: g, color: H.REG_COLOR[g],
      pts: Object.entries(H.M.patients.rows).map(([cid, r]) => r[id] ? { id: cid, v: r[id][PI((hd ? "HD95_" : "Dice_") + g)], dice: r[id][PI("Dice_" + g)], hd: r[id][PI("HD95_" + g)] } : null).filter(Boolean),
    }));
    C.strip(H.$("#chart-strip"), {
      groups, min: 0, max: hd ? cap : 1, fmt: hd ? v => C.txt(v, 0) : v => (v * 100).toFixed(0) + "%", yLabel: hd ? "HD95 (mm, capped at 40)" : "Dice",
      tip: (g, p) => H.tip.rows(p.id + " · " + g.key, [["Dice", H.pct(p.dice, 2) + " %", g.color], ["HD95", H.f(p.hd, 2) + " mm"]], "Click to open patient record"), onClick: H.openPatient,
    });
    const g = groups[2].pts, z = g.filter(p => p.dice === 0).length, low = g.filter(p => p.dice < .4).length, far = Object.values(groups).flatMap(x => x.pts).filter(p => p.hd > cap).length;
    H.$("#strip-note").innerHTML = `<b>${H.esc(H.mlabel(id))}</b>. White-outlined dots are clipped at the axis limit. ET: <b>${low}</b> patients below 0.40 Dice (<b>${z}</b> exactly 0, typically no or tiny enhancing region); <b>${far}</b> HD95 values exceed ${cap} mm (empty-region convention applies, see report).`;
  }

  function scatter() {
    const x = B.scX, y = B.scY, r = B.scR, di = PI("Dice_" + r), pts = [];
    let wy = 0, wx = 0, tie = 0, dsum = 0, n = 0;
    Object.entries(H.M.patients.rows).forEach(([cid, row]) => {
      if (!row[x] || !row[y]) return; const a = row[x][di], b = row[y][di], d = b - a; n++; dsum += d;
      if (Math.abs(d) < 1e-9) tie++; else if (d > 0) wy++; else wx++;
      pts.push({ id: cid, x: a, y: b, color: Math.abs(d) < 1e-9 ? "#7fa3b3" : d > 0 ? H.mcolor(y) : H.mcolor(x), big: Math.abs(d) > .2 });
    });
    C.scatter(H.$("#chart-scatter"), {
      pts, min: 0, max: 1, xLabel: H.mlabel(x) + " — " + r + " Dice", yLabel: H.mlabel(y) + " — " + r + " Dice", xColor: H.mcolor(x), yColor: H.mcolor(y), fmt: v => (v * 100).toFixed(0) + "%",
      tip: p => H.tip.rows(p.id, [[H.model(x).short, H.pct(p.x, 2) + " %", H.mcolor(x)], [H.model(y).short, H.pct(p.y, 2) + " %", H.mcolor(y)], ["difference (Y − X)", H.sgn((p.y - p.x) * 100, 2) + " pts"]], "Click to open patient record"), onClick: H.openPatient,
    });
    H.$("#sc-note").innerHTML = `${r}: <b style="color:${H.mcolor(y)}">${H.model(y).short}</b> better in <b>${wy}</b>, <b style="color:${H.mcolor(x)}">${H.model(x).short}</b> better in <b>${wx}</b>, tied in ${tie} of ${n} patients; mean difference <b>${H.sgn(dsum / n * 100, 2)}</b> Dice points (descriptive; see the paired CI at top).`;
  }

  function cost() {
    const f = H.M.leaderboard, st = H.M.claims.stopping;
    H.$("#cost-sub").textContent = (H.M.runtime_scope || "") + " · inference VRAM is the recorded peak.";
    const stop = (id, stage) => { const s = st[id + "/" + stage]; return s ? `<span class="tag ${s === "early_stopping" ? "ok" : "warn"}">${s === "early_stopping" ? "early stop" : "epoch cap"}</span>` : "–"; };
    H.$("#cost-table").innerHTML = `<thead><tr><th>Model</th><th>Graph params</th><th>Voxel params</th><th>Training time</th><th>Best epoch (graph / voxel)</th><th>Graph stage</th><th>Voxel stage</th><th>Inference / patient</th><th>Peak VRAM</th><th>Nodes</th><th>Edges</th></tr></thead><tbody>` +
      f.map(r => `<tr style="cursor:default"><td style="color:${H.mcolor(r.experiment)};font-weight:700">${H.esc(H.model(r.experiment).short)}</td><td class="num">${r.graph_parameters ? H.big(r.graph_parameters) : "–"}</td><td class="num">${r.voxel_parameters ? H.big(r.voxel_parameters) : "–"}</td><td class="num">${H.hours(r.recorded_training_seconds)}</td><td class="num">${r.graph_best_epoch ?? "–"} / ${r.voxel_best_epoch ?? "–"}</td><td>${stop(r.experiment, "graph")}</td><td>${stop(r.experiment, "voxel")}</td><td class="num">${H.f(r.cached_graph_inference_seconds_mean, 2)} s</td><td class="num">${H.gb(r.inference_peak_cuda_bytes)}</td><td class="num">${r.graph_parameters ? H.big(r.graph_nodes_mean) : "–"}</td><td class="num">${r.graph_parameters ? H.big(r.graph_edges_mean) : "–"}</td></tr>`).join("") + "</tbody>";
  }

  H.views.bench = {
    init() {
      const M = H.M, ids = M.leaderboard.map(r => r.experiment), opt = ids.map(id => `<option value="${id}">${H.esc(H.mlabel(id))}</option>`).join("");
      H.$("#bench-sub").textContent = `${M.cohort}. Same patients, same split for every row.`;
      ["#bench-ref", "#strip-model", "#sc-x", "#sc-y"].forEach(s => H.$(s).innerHTML = opt);
      H.$("#bench-ref").value = B.ref; H.$("#strip-model").value = B.stripModel; H.$("#sc-x").value = B.scX; H.$("#sc-y").value = B.scY;
      H.$("#bench-ref").onchange = e => { B.ref = e.target.value; table(); }; H.$("#bench-delta").onchange = e => { B.delta = e.target.checked; table(); };
      H.$("#bench-table").onclick = e => { const th = e.target.closest("th.sortable"); if (th) { B.sort = { k: th.dataset.k, dir: B.sort.k === th.dataset.k ? -B.sort.dir : (th.dataset.k.startsWith("HD") ? 1 : -1) }; table(); return; } const tr = e.target.closest("tbody tr"); if (tr) { B.stripModel = tr.dataset.id; H.$("#strip-model").value = B.stripModel; table(); strip(); } };
      H.$("#bench-table").addEventListener("mousemove", e => { const td = e.target.closest("td[data-tip]"); td && td.dataset.tip ? H.tip.show(`<div class="r"><b>${H.esc(td.dataset.tip)}</b></div>`, e) : H.tip.hide(); });
      H.$("#bench-table").addEventListener("mouseleave", () => H.tip.hide());
      const seg = (sel, key, fn) => H.$(sel).onclick = e => { const b = e.target.closest("button"); if (!b) return; H.$$(sel + " button").forEach(x => x.classList.toggle("on", x === b)); B[key] = b.dataset.k; fn(); };
      seg("#bar-metric", "bar", bars); seg("#forest-metric", "forest", forest); seg("#strip-metric", "stripMetric", strip); seg("#sc-region", "scR", scatter);
      H.$("#bar-sd").onchange = e => { B.sd = e.target.checked; bars(); };
      H.$("#strip-model").onchange = e => { B.stripModel = e.target.value; table(); strip(); };
      H.$("#sc-x").onchange = e => { B.scX = e.target.value; scatter(); }; H.$("#sc-y").onchange = e => { B.scY = e.target.value; scatter(); };
      cost();
    },
    show() { table(); bars(); forest(); strip(); scatter(); },
  };
})();
