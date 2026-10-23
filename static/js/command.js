/* command.js - 01 COMMAND: headline gauges, pipeline explorer, generated findings, evidence status */
"use strict";

(() => {
  const gauge = (key, label, value, color, sub) => {
    const r = 58, circ = 2 * Math.PI * r, ticks = Array.from({ length: 60 }, (_, i) => { const a = i / 60 * 2 * Math.PI, l = i % 5 ? 3 : 6; return `<line x1="${75 + Math.sin(a) * (r + 8)}" y1="${75 - Math.cos(a) * (r + 8)}" x2="${75 + Math.sin(a) * (r + 8 + l)}" y2="${75 - Math.cos(a) * (r + 8 + l)}" stroke="${color}" stroke-opacity="${i % 5 ? .25 : .6}"/>`; }).join("");
    return `<div class="gauge" data-g="${key}"><svg viewBox="-8 -8 166 166"><g>${ticks}</g>
      <circle cx="75" cy="75" r="${r}" fill="none" stroke="rgba(76,201,240,.12)" stroke-width="9"/>
      <circle class="arc" cx="75" cy="75" r="${r}" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="butt" stroke-dasharray="${circ}" stroke-dashoffset="${circ}" transform="rotate(-90 75 75)" style="transition:stroke-dashoffset 1.3s cubic-bezier(.2,.8,.2,1);filter:drop-shadow(0 0 6px ${color})" data-v="${value}" data-c="${circ}"/>
      <circle cx="75" cy="75" r="${r - 14}" fill="none" stroke="${color}" stroke-opacity=".25" stroke-dasharray="2 5"/>
      <text class="val" x="75" y="80" text-anchor="middle" data-count="${value * 100}">0.00</text><text class="unit" x="75" y="98" text-anchor="middle">% DICE</text></svg>
      <div class="cap" style="color:${color}">${label}</div><div class="sub">${sub}</div></div>`;
  };

  const verdict = (diff, ci) => ci[0] > 0 ? ["ok", "better", "the 95% CI is entirely above 0"] : ci[1] < 0 ? ["bad", "worse", "the 95% CI is entirely below 0"] : ["info", "not distinguishable", "the 95% CI includes 0"];

  function findings() {
    const M = H.M, vf = M.comparisons.vs_full.rows, go = M.comparisons.graph_only.rows, out = [];
    const line = (lvl, html, sub) => `<div class="finding ${lvl}"><div class="ic">${{ ok: "✓", warn: "!", info: "i", bad: "×" }[lvl]}</div><div>${html}${sub ? `<small>${sub}</small>` : ""}</div></div>`;
    const dm = (r) => r && r.Dice_mean;
    const row = (txt, d) => { const v = verdict(d.diff, d.ci); return line(v[0], `${txt} <b class="num">${H.sgn(d.diff, 4)}</b> mean Dice <span class="dim">(95% CI ${H.f(d.ci[0], 4)} … ${H.f(d.ci[1], 4)})</span> — <b>${v[1]}</b>`, `${v[2]}; n = ${M.comparisons.vs_full.n_patients} patients, seed-conditional.`); };
    if (dm(vf.no_voxel)) out.push(row("CNN refinement adds", dm(vf.no_voxel)));
    if (dm(vf.cnn_only)) out.push(row("Graph channels add over the same CNN without a graph:", dm(vf.cnn_only)));
    if (dm(vf.segresnet)) out.push(row("Versus the SegResNet baseline:", dm(vf.segresnet)));
    if (dm(go.graphsage_backbone)) { const d = dm(go.graphsage_backbone), v = verdict(d.diff, d.ci); out.push(line(v[0] === "ok" ? "ok" : "info", `HGT vs GraphSAGE (graph-only): <b class="num">${H.sgn(d.diff, 4)}</b> <span class="dim">(CI ${H.f(d.ci[0], 4)} … ${H.f(d.ci[1], 4)})</span> — <b>${v[0] === "ok" ? "better" : "borderline / not distinguishable"}</b>`, "Graph-only controls are compared against the graph-only HGT row.")); }
    if (dm(go.fixed_shared_hops)) { const d = dm(go.fixed_shared_hops), v = verdict(d.diff, d.ci); out.push(line(v[0] === "ok" ? "ok" : v[0] === "bad" ? "warn" : "info", `Learned hop mixture vs fixed 2-hop (graph-only): <b class="num">${H.sgn(d.diff, 4)}</b> <span class="dim">(CI ${H.f(d.ci[0], 4)} … ${H.f(d.ci[1], 4)})</span> — <b>${v[0] === "ok" ? "learned hops better" : v[0] === "bad" ? "fixed hops better" : "no measurable accuracy benefit"}</b>`, "Present the hop mixture as an explainability tool, not as an accuracy gain.")); }
    const f = H.lb("full"), s = H.lb("segresnet");
    if (f && s) {
      const mh = r => H.mean(["WT", "TC", "ET"].map(k => r["HD95_" + k + "_mean"]));
      out.push(line("info", `Surface error (mean HD95): QoS-HRGN <b class="num">${H.f(mh(f), 2)} mm</b> vs SegResNet <b class="num">${H.f(mh(s), 2)} mm</b>`, "Descriptive only — the saved report gives paired intervals for Dice, not for HD95."));
      if (f.recorded_training_seconds && s.recorded_training_seconds) out.push(line("info", `Recorded training time: QoS-HRGN <b class="num">${H.hours(f.recorded_training_seconds)}</b> vs SegResNet <b class="num">${H.hours(s.recorded_training_seconds)}</b>`, "The hybrid also needs SLIC graph construction at inference time (excluded from the timing below)."));
    }
    return out.join("");
  }

  function statusPanel() {
    const M = H.M, st = M.claims.stopping, tags = Object.entries(st).sort().map(([k, v]) => `<span class="tag ${v === "early_stopping" ? "ok" : "warn"}" title="${H.esc(k)}">${H.esc(k)}: ${v === "early_stopping" ? "early stop" : v.replace("_", " ")}</span>`).join(" ");
    const lines = [`<div class="finding ok"><div class="ic">✓</div><div>${M.kpis.test_cases} held-out patients, identical split for every model<small>Model hash <span class="mono">${H.esc(M.model_hash)}</span></small></div></div>`];
    M.claims.notes.forEach(n => lines.push(`<div class="finding ${n.level === "warn" ? "warn" : "info"}"><div class="ic">${n.level === "warn" ? "!" : "i"}</div><div>${H.esc(n.text)}</div></div>`));
    lines.push(`<div class="finding info"><div class="ic">i</div><div>Stopping reasons<small style="margin-top:4px;line-height:2">${tags}</small></div></div>`);
    if (M.claims.flags.publication_ready_certified === false || M.claims.flags.multi_seed_reproducibility_established === false) lines.push(`<div class="finding info"><div class="ic">i</div><div>Multi-seed reproducibility is not established; no publication-readiness certification is claimed.</div></div>`);
    return lines.join("");
  }

  function pipeline() {
    const M = H.M, k = M.kpis, hs = M.hop_summary, f = H.lb("full"), tr = M.training;
    const hop = reg => ["t1ce", "flair"].map(nt => hs[nt + "/" + reg] ? `${nt.toUpperCase()} ${H.f(hs[nt + "/" + reg].patient_mean, 2)}` : "").filter(Boolean).join(" · ");
    const st = [
      { n: "01", t: "MRI", s: "T1 · T1ce · T2 · FLAIR", d: `Four co-registered BraTS 2021 modalities. All four feed node appearance features (7 statistics each) plus 4 geometry features per supervoxel; T1ce and FLAIR define the partitions.` },
      { n: "02", t: "SLIC", s: `${H.big(k.supervoxels)} per partition`, d: `SLIC supervoxels are computed on T1ce and on FLAIR, giving two node types. About <b class="num">${H.big(k.nodes)}</b> nodes per patient in total.` },
      { n: "03", t: "Hetero-graph", s: `${H.big(k.edges)} edges`, d: `Typed edges: T1ce–T1ce spatial, FLAIR–FLAIR spatial and T1ce↔FLAIR correspondence. Mean <b class="num">${H.big(k.edges)}</b> edges (≈ ${H.f(k.edges / k.nodes, 1)} per node) per patient.` },
      { n: "04", t: "HGT", s: `${H.big(k.graph_params)} params`, d: `Two-layer Heterogeneous Graph Transformer, 128 hidden units. Graph parameters: <b class="num">${(k.graph_params || 0).toLocaleString()}</b>. Best validation epoch ${tr.graph_best_epoch}, stopped by ${H.esc(M.claims.stopping["full/graph"] || "–")}.` },
      { n: "05", t: "Hop mixture", s: "learned, K ≤ 2", d: `A gated, bounded mixture of 0–2 extra propagation hops per node. Mean effective hop — WT: ${hop("WT")}; TC: ${hop("TC")}; ET: ${hop("ET")}.` },
      { n: "06", t: "Projection", s: "nodes → voxels", d: `Node class probabilities are projected to the voxel grid, giving four extra input channels next to the four MRI channels.` },
      { n: "07", t: "3D CNN", s: `${H.big(k.voxel_params)} params`, d: `3D U-Net refinement recovers fine boundaries. Parameters: <b class="num">${(k.voxel_params || 0).toLocaleString()}</b>. Best epoch ${tr.voxel_best_epoch} of ${tr.voxel.length}; stopped by <b>${H.esc(M.claims.stopping["full/voxel"] || "–")}</b>.` },
      { n: "08", t: "Output", s: `${H.pct(k.mean_dice, 1)}% mean Dice`, d: `WT ${H.pct(k.wt_dice)}% · TC ${H.pct(k.tc_dice)}% · ET ${H.pct(k.et_dice)}% Dice; HD95 ${H.f(k.wt_hd95)} / ${H.f(k.tc_hd95)} / ${H.f(k.et_hd95)} mm.` },
    ];
    H.$("#pipe").innerHTML = st.map((s, i) => `<button class="stage ${i === 4 ? "on" : ""}" data-i="${i}"><div class="n">${s.n}</div><div class="t">${s.t}</div><div class="s">${s.s}</div></button>`).join("");
    const show = i => { H.$$("#pipe .stage").forEach((b, j) => b.classList.toggle("on", i === j)); H.$("#pipe-detail").innerHTML = `<div class="note"><b>${st[i].n} · ${st[i].t}</b> — ${st[i].d}</div>`; };
    H.$("#pipe").onclick = e => { const b = e.target.closest(".stage"); if (b) show(+b.dataset.i); };
    show(4);
  }

  H.views.command = {
    init() {
      const M = H.M, k = M.kpis;
      H.$("#cmd-cohort").textContent = `${M.cohort} · 15k SLIC supervoxels per partition · single seed (42)`;
      const f = H.lb("full"), pn = (r) => `±${H.pct(f["Dice_" + r + "_patient_sd"], 1)} patient SD`;
      H.$("#kpis").innerHTML =
        gauge("wt", "Whole tumour", k.wt_dice, H.REG_COLOR.WT, pn("WT")) + gauge("tc", "Tumour core", k.tc_dice, H.REG_COLOR.TC, pn("TC")) + gauge("et", "Enhancing", k.et_dice, H.REG_COLOR.ET, pn("ET")) +
        `<div class="panel" style="padding:14px 16px"><div class="grid" style="grid-template-columns:1fr 1fr;gap:10px 14px">
          <div class="stat"><span class="k">HD95 WT</span><span class="v">${H.f(k.wt_hd95)}<small> mm</small></span></div>
          <div class="stat"><span class="k">HD95 TC</span><span class="v">${H.f(k.tc_hd95)}<small> mm</small></span></div>
          <div class="stat"><span class="k">HD95 ET</span><span class="v">${H.f(k.et_hd95)}<small> mm</small></span></div>
          <div class="stat"><span class="k">Mean Dice</span><span class="v" style="color:var(--gold)">${H.pct(k.mean_dice, 2)}<small> %</small></span></div>
          <div class="stat"><span class="k">Nodes / patient</span><span class="v">${H.big(k.nodes)}</span></div>
          <div class="stat"><span class="k">Edges / patient</span><span class="v">${H.big(k.edges)}</span></div></div></div>`;
      pipeline();
      H.$("#findings").innerHTML = findings();
      H.$("#status").innerHTML = statusPanel();
      const J = [["scan", "02 · Scan viewport", "Overlay, swipe and compare segmentations on a real slice"], ["bench", "03 · Benchmark", "Sortable leaderboard, paired CIs, 189-patient scatter"], ["graph", "04 · Graph lab", "Rotate and probe the heterogeneous graph; gate α statistics"], ["xai", "05 · Explain", "Shapley modality attribution and effective-hop distributions"], ["train", "06 · Training", "Learning curves and stopping evidence"], ["slic", "07 · SLIC", "Supervoxel-resolution pilot"]];
      H.$("#jump").innerHTML = J.map(j => `<button class="iconbtn" style="text-align:left;clip-path:none" data-go="${j[0]}"><b style="color:#fff">${j[1]}</b><br><span class="dim" style="text-transform:none;letter-spacing:0;font-family:var(--font-body);font-size:13px">${j[2]}</span></button>`).join("");
      H.$("#jump").onclick = e => { const b = e.target.closest("[data-go]"); if (b) H.go(b.dataset.go); };
    },
    show() {
      H.$$("#kpis .gauge").forEach(g => {
        const arc = g.querySelector(".arc"), v = +arc.dataset.v, c = +arc.dataset.c; arc.style.strokeDashoffset = c; requestAnimationFrame(() => requestAnimationFrame(() => { arc.style.strokeDashoffset = c * (1 - v); }));
        const t = g.querySelector(".val"); H.counter(t, +t.dataset.count, { dec: 2 });
      });
    },
  };
})();
