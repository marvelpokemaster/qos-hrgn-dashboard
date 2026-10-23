/* slic.js - 07 SLIC: supervoxel-resolution pilot (validation-only, 16 patients) */
"use strict";

(() => {
  const Z = { hidden: new Set() };
  const rows = () => H.M.slic.rows.slice().sort((a, b) => a.n_segments_per_partition - b.n_segments_per_partition);

  function chart() {
    const R = rows(), ser = [
      { id: "nodes", name: "graph nodes (compute cost)", color: "#5cf3ff", axis: 1, type: "bar", pts: R.map(r => [r.n_segments_per_partition, r.graph_nodes_mean]), fmt: v => H.big(v) },
      ...H.REG.map(g => ({ id: g, name: g + " Dice", color: H.REG_COLOR[g], dots: true, width: 2.5, pts: R.map(r => [r.n_segments_per_partition, r["Dice_" + g + "_mean"]]), fmt: v => H.pct(v, 2) + " %" })),
    ];
    C.legend(H.$("#slic-legend"), ser.map(s => ({ id: s.id, name: s.name, color: s.color })), Z.hidden, chart);
    const sel = H.M.kpis.supervoxels;
    C.lines(H.$("#chart-slic"), {
      series: ser, hidden: Z.hidden, xmin: R[0].n_segments_per_partition * .8, xmax: R[R.length - 1].n_segments_per_partition * 1.08, xticks: R.map(r => ({ v: r.n_segments_per_partition, label: r.n_segments_per_partition / 1000 + "k" })),
      xLabel: "supervoxels per partition", yLabel: "validation Dice (graph-only pilot)", y2Label: "nodes per patient", fmtY: v => (v * 100).toFixed(0) + "%", fmtY2: v => H.big(v), y2min: 0,
      vlines: [{ x: sel, color: "#ffb300", label: "chosen" }], tipTitle: x => (x / 1000) + "k supervoxels",
      tipHint: x => { const r = R.find(q => q.n_segments_per_partition === x); return r ? `${H.big(r.graph_edges_mean)} edges · peak VRAM ${H.gb(r.inference_peak_cuda_bytes)}` : ""; },
    });
  }

  function notes() {
    const R = rows(), by = n => R.find(r => r.n_segments_per_partition === n), a = by(5000), b = by(10000), c = by(15000), d = by(20000), sc = H.M.slic.scope || {};
    const gain = (x, y) => H.REG.map(g => `${g} ${H.sgn((y["Dice_" + g + "_mean"] - x["Dice_" + g + "_mean"]) * 100, 2)}`).join(" · ");
    H.$("#slic-sub").textContent = sc.scope || "Validation-only graph pilot";
    if (a && c && d) H.$("#slic-note").innerHTML = `<b>Pilot, not a conclusive selection${sc.conclusive_resolution_selection === false ? " (flagged as such in the saved scope)" : ""}.</b> 5k → 15k: ${gain(a, c)} Dice points. 15k → 20k: ${gain(c, d)} — ET is still rising at 20k while TC dips, and every run used the short epoch budget (${R.map(r => r.graph_stopping_reason).filter((v, i, s) => s.indexOf(v) === i).join(", ").replace("_", " ")}). 15k is a defensible cost/accuracy compromise (nodes ×${H.f(d.graph_nodes_mean / c.graph_nodes_mean, 2)} at 20k), but this pilot cannot prove it is optimal.`;
    H.$("#slic-table").innerHTML = `<thead><tr><th>Supervoxels</th><th>Nodes</th><th>Edges</th><th style="color:${H.REG_COLOR.WT}">WT</th><th style="color:${H.REG_COLOR.TC}">TC</th><th style="color:${H.REG_COLOR.ET}">ET</th><th>Best ep.</th><th>VRAM</th></tr></thead><tbody>` +
      R.map(r => `<tr style="cursor:default" class="${r.n_segments_per_partition === H.M.kpis.supervoxels ? "sel" : ""}"><td class="num">${r.n_segments_per_partition / 1000}k</td><td class="num">${H.big(r.graph_nodes_mean)}</td><td class="num">${H.big(r.graph_edges_mean)}</td>${H.REG.map(g => `<td class="num">${H.pct(r["Dice_" + g + "_mean"], 2)}</td>`).join("")}<td class="num">${r.graph_best_epoch}</td><td class="num">${H.gb(r.inference_peak_cuda_bytes)}</td></tr>`).join("") + "</tbody>";
    H.$("#slic-gallery").innerHTML = Object.entries(H.M.images.slic).map(([k, u]) => `<figure data-u="${u}" data-c="${H.esc(k)}"><img loading="lazy" alt="${H.esc(k)}" src="${u}"><figcaption>${H.esc(k.replace(/_/g, " "))}</figcaption></figure>`).join("");
    H.$("#slic-gallery").onclick = e => { const f = e.target.closest("figure"); if (f) H.openModal(f.dataset.c, f.dataset.u); };
  }

  H.views.slic = { init() { notes(); }, show() { chart(); } };
})();
