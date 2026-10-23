/* xai.js - 05 EXPLAIN: exact modality Shapley attribution + effective-hop distributions (all from saved reports) */
"use strict";

(() => {
  const X = { shapHidden: new Set(), shapPatient: "mean", hopPatient: "all", hopRegion: "WT", hopNorm: true, hopHidden: new Set() };
  const NT = [{ id: "t1ce", name: "T1ce nodes", color: "#5cf3ff" }, { id: "flair", name: "FLAIR nodes", color: "#ffb300" }];

  function shap() {
    const S = H.M.shapley, ser = H.REG.map(r => {
      let vals, err = null;
      if (X.shapPatient === "mean") { const s = S.summary[r]; vals = s ? s.mean : [0, 0, 0, 0]; err = s ? s.std : null; }
      else { const p = S.patients.find(q => q.case_id === X.shapPatient); vals = p && p.regions[r] ? p.regions[r] : [0, 0, 0, 0]; }
      return { id: r, name: r + " — " + H.REG_NAME[r], color: H.REG_COLOR[r], values: vals, err };
    });
    C.legend(H.$("#shap-legend"), ser.map(s => ({ id: s.id, name: s.name, color: s.color })), X.shapHidden, shap);
    const vis = ser.filter(s => !X.shapHidden.has(s.id)), all = vis.flatMap(s => s.values.map((v, i) => v + (s.err ? s.err[i] : 0))), lo = vis.flatMap(s => s.values.map((v, i) => v - (s.err ? s.err[i] : 0)));
    const max = Math.max(.1, ...all) * 1.15, min = Math.min(0, ...lo) * 1.2;
    C.bars(H.$("#chart-shap"), {
      cats: H.MOD.map(m => ({ label: m })), series: ser, hidden: X.shapHidden, min, max, zero: 0, yLabel: "mean Shapley contribution to region probability", fmt: v => C.txt(v, 2),
      tip: (ci, se) => H.tip.rows(se.id + " · " + H.MOD[ci], [["contribution", H.sgn(se.values[ci], 3), se.color], ...(se.err ? [["SD across patients", "±" + H.f(se.err[ci], 3)]] : [])]),
    });
    const lines = H.REG.map(r => {
      const v = ser.find(s => s.id === r).values, pos = v.map(x => Math.max(0, x)), tot = pos.reduce((a, b) => a + b, 0) || 1, order = v.map((x, i) => i).sort((a, b) => v[b] - v[a]);
      return `<div class="finding info"><div class="ic" style="color:${H.REG_COLOR[r]}">${r}</div><div><b>${H.MOD[order[0]]}</b> is the largest contributor (${H.f(v[order[0]], 3)}, ${(100 * pos[order[0]] / tot).toFixed(0)}% of the positive attribution), then <b>${H.MOD[order[1]]}</b> (${H.f(v[order[1]], 3)}).</div></div>`;
    }).join("");
    H.$("#shap-insights").innerHTML = lines + `<div class="note">Bars are contributions to the graph model's region probability, <b>not normalised to 100%</b>; they can be negative for a single patient. Graph branch only, fixed topology — no CNN or SLIC attribution. ${X.shapPatient === "mean" ? "Error bars: SD across the ten patients." : ""}</div>`;
  }

  function hops() {
    const A = H.hops, r = X.hopRegion, bins = A.bins;
    const ser = NT.map(n => {
      let h, mean, cnt;
      if (X.hopPatient === "all") { const a = A.aggregate[n.id] && A.aggregate[n.id][r]; h = a ? a.hist : bins.slice(1).map(() => 0); mean = a ? a.mean : null; cnt = a ? a.n : 0; }
      else { const p = A.patients[X.hopPatient] && A.patients[X.hopPatient][n.id] && A.patients[X.hopPatient][n.id][r]; h = p ? p[2] : bins.slice(1).map(() => 0); mean = p ? p[1] : null; cnt = p ? p[0] : 0; }
      return { id: n.id, name: n.name, color: n.color, counts: h, mean, n: cnt };
    });
    C.legend(H.$("#hop-legend"), ser.map(s => ({ id: s.id, name: s.name, color: s.color })), X.hopHidden, hops);
    C.hist(H.$("#chart-hops"), { bins, series: ser, hidden: X.hopHidden, norm: X.hopNorm, xLabel: "effective additional hops (0 = none, 2 = K_MAX)", xName: "hop", vlines: ser.filter(s => !X.hopHidden.has(s.id) && s.mean != null).map(s => ({ x: s.mean, color: s.color, label: "μ " + H.f(s.mean, 2) })) });
    H.$("#hop-note").innerHTML = `Region <b style="color:${H.REG_COLOR[r]}">${r}</b> (node-majority): ${ser.map(s => `<b style="color:${s.color}">${s.n.toLocaleString()}</b> ${s.name}`).join(", ")}${X.hopPatient === "all" ? ` across ${Object.keys(A.patients).length} test patients` : " in " + H.esc(X.hopPatient)}. Dashed lines = mean effective hop. The mixture is bounded to 0–2 hops after the HGT layers; accuracy with learned vs fixed hops is statistically indistinguishable (Command module), so this is an interpretability result.`;
  }

  function hopMeans() {
    const hs = H.M.hop_summary, regs = H.REG;
    const ser = NT.map(n => ({ id: n.id, name: n.name, color: n.color, values: regs.map(r => hs[n.id + "/" + r] && hs[n.id + "/" + r].patient_mean), err: regs.map(r => hs[n.id + "/" + r] && hs[n.id + "/" + r].patient_sd) }));
    C.bars(H.$("#chart-hopmeans"), { cats: regs.map(r => ({ label: r, sub: H.REG_NAME[r] })), series: ser, min: 0, max: 2, fmt: v => C.txt(v, 1), yLabel: "mean effective hop (K_MAX = 2)", tip: (ci, se) => { const d = hs[se.id + "/" + regs[ci]]; return H.tip.rows(se.name + " · " + regs[ci], [["patient mean", H.f(d.patient_mean, 3), se.color], ["patient SD", "±" + H.f(d.patient_sd, 3)], ["patients with region", d.n_present]]); } });
  }

  H.views.xai = {
    async init() {
      const S = H.M.shapley, pids = S.patients.map(p => p.case_id);
      H.$("#shap-scope").textContent = S.scope || "";
      H.$("#shap-patient").innerHTML = `<option value="mean">Mean of ${pids.length} fixed test patients</option>` + pids.map(p => `<option value="${p}">${p}</option>`).join("");
      H.$("#shap-patient").onchange = e => { X.shapPatient = e.target.value; shap(); };
      H.$("#hop-scope").textContent = H.M.hop_scope || "";
      try { await H.loadHops(); } catch (e) { H.$("#view-xai").insertAdjacentHTML("afterbegin", `<div class="err">${H.esc(e.message)}</div>`); return; }
      H.$("#hop-patient").innerHTML = `<option value="all">All test patients (aggregate)</option>` + Object.keys(H.hops.patients).sort().map(p => `<option value="${p}">${p}</option>`).join("");
      H.$("#hop-patient").onchange = e => { X.hopPatient = e.target.value; hops(); };
      H.$("#hop-region").onclick = e => { const b = e.target.closest("button"); if (!b) return; H.$$("#hop-region button").forEach(x => x.classList.toggle("on", x === b)); X.hopRegion = b.dataset.k; hops(); };
      H.$("#hop-norm").onchange = e => { X.hopNorm = e.target.checked; hops(); };
      X.ready = true;
    },
    show() { shap(); if (X.ready) { hops(); hopMeans(); } },
  };
})();
