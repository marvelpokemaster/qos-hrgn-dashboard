/* validate.js - 08 VALIDATE: HGT vs GraphSAGE under the same CNN, CNN-error analysis, faithfulness tests.
   Reads /data/validation.json (compiled from the saved advisor follow-up results). */
"use strict";

(() => {
  let V = null;
  const chip = (level, text) => `<span class="chip ${level === "ok" ? "ok" : level === "warn" ? "warn" : ""}"><span class="dot"></span>${H.esc(text)}</span>`;
  const n0 = v => Number(v).toLocaleString("en-US");

  function verdicts() {
    H.$("#val-verdicts").innerHTML = V.verdicts.map(v =>
      `<div class="panel ${v.level === "ok" ? "gold" : ""}" style="margin:0"><div class="ph"><h3>${H.esc(v.label)}</h3>${chip(v.level, v.verdict)}</div><p class="lead" style="margin:0">${H.esc(v.text)}</p></div>`).join("");
  }

  function ciRows(rows) {
    const lo = Math.min(...rows.map(r => r.lo), 0), hi = Math.max(...rows.map(r => r.hi), 0), pad = (hi - lo) * .12, a = lo - pad, b = hi + pad;
    const X = v => ((v - a) / (b - a) * 100).toFixed(2) + "%";
    return rows.map(r => {
      const sig = r.lo > 0 || r.hi < 0, col = sig ? "var(--gold)" : "var(--txt-dim)";
      return `<tr style="cursor:default"><td>${H.esc(r.label)}</td><td class="num">${H.sgn(r.diff, 2)}</td><td class="num">${H.sgn(r.lo, 2)} … ${H.sgn(r.hi, 2)}</td><td class="num">${H.f(r.p, 3)}</td>` +
        `<td style="width:38%"><div style="position:relative;height:18px"><div style="position:absolute;left:${X(0)};top:0;bottom:0;width:1px;background:#fff;opacity:.6"></div>` +
        `<div style="position:absolute;left:${X(r.lo)};width:calc(${X(r.hi)} - ${X(r.lo)});top:8px;height:3px;background:${col};border-radius:2px"></div>` +
        `<div style="position:absolute;left:calc(${X(r.diff)} - 5px);top:4px;width:10px;height:10px;border-radius:50%;border:2px solid ${col};background:#01050b"></div></div></td></tr>`;
    }).join("");
  }

  function tie() {
    const T = V.tie;
    H.$("#val-tie-title").textContent = T.title;
    H.$("#val-tie-rows").innerHTML = `<thead><tr><th>Model</th><th style="color:${H.REG_COLOR.WT}">WT</th><th style="color:${H.REG_COLOR.TC}">TC</th><th style="color:${H.REG_COLOR.ET}">ET</th><th>Mean</th><th>HD95 WT / TC / ET</th></tr></thead><tbody>` +
      T.rows.map(r => `<tr style="cursor:default"><td>${H.esc(r.label)}</td><td class="num">${H.f(r.WT)}</td><td class="num">${H.f(r.TC)}</td><td class="num">${H.f(r.ET)}</td><td class="num">${H.f(r.mean)}</td><td class="num">${r.hd95.map(x => H.f(x)).join(" / ")}</td></tr>`).join("") + "</tbody>";
    H.$("#val-tie-paired").innerHTML = `<thead><tr><th>Paired difference</th><th>Δ Dice (pts)</th><th>95% CI</th><th>Holm p</th><th>CI vs 0</th></tr></thead><tbody>${ciRows(T.paired)}</tbody>`;
    H.$("#val-tie-note").innerHTML = `<b>Reading.</b> ${H.esc(T.reading)}<br><span class="faint">${H.esc(T.training)}</span>`;
  }

  function cnnError() {
    const E = V.cnn_error;
    H.$("#val-err-title").textContent = E.title;
    H.$("#val-err-table").innerHTML = `<thead><tr><th>Ground-truth class</th><th>Corrected</th><th>Introduced</th><th>Net</th></tr></thead><tbody>` +
      E.rows.map(r => { const net = r.corrected - r.introduced; return `<tr style="cursor:default"><td>${H.esc(r.label)}</td><td class="num">${n0(r.corrected)}</td><td class="num">${n0(r.introduced)}</td><td class="num" style="color:${net > 0 ? "var(--ok)" : "var(--red)"}">${net > 0 ? "+" : "−"}${n0(Math.abs(net))}</td></tr>`; }).join("") + "</tbody>";
    H.$("#val-err-facts").innerHTML = E.facts.map(f => `<li>${H.esc(f)}</li>`).join("");
  }

  function faith() {
    H.$("#val-faith").innerHTML = V.faithfulness.map(t =>
      `<div class="panel" style="margin:0"><div class="ph"><h3>${H.esc(t.id)} · ${H.esc(t.title)}</h3>${chip(t.level, t.verdict)}</div><ul class="faint" style="margin:0;padding-left:18px;line-height:1.55">${t.lines.map(l => `<li>${H.esc(l)}</li>`).join("")}</ul></div>`).join("");
  }

  function notes() {
    H.$("#val-notes").innerHTML = V.notes.map(n => `<div class="note ${n.level === "warn" ? "warn" : ""}">${H.esc(n.text)}</div>`).join("");
  }

  async function load() {
    const r = await fetch("/data/validation.json", { cache: "no-cache" });
    if (!r.ok) throw new Error("validation.json missing (HTTP " + r.status + ")");
    V = await r.json(); H.validation = V;
    H.$("#val-title").textContent = V.title; H.$("#val-scope").textContent = V.scope; H.$("#val-source").textContent = V.source;
    verdicts(); tie(); cnnError(); faith(); notes();
  }

  H.views.validate = { init() { return load(); }, show() { } };
})();
