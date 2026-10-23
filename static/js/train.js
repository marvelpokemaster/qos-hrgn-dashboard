/* train.js - 06 TRAINING: interactive learning curves + stopping evidence (main_training_history.json) */
"use strict";

(() => {
  const T = { gh: new Set(["train_loss", "val_loss"]), vh: new Set(["train_loss", "val_loss", "train_patch"]) };   // loss curves start hidden to keep Dice readable

  const stat = (k, v, sub) => `<div class="panel"><div class="stat"><span class="k">${k}</span><span class="v">${v}</span>${sub ? `<span class="dim" style="font-size:13px">${sub}</span>` : ""}</div></div>`;

  function cards() {
    const M = H.M, tr = M.training, st = M.claims.stopping, f = H.lb("full");
    const g = tr.graph, v = tr.voxel, gb = g.find(r => r.epoch === tr.graph_best_epoch), vb = v.find(r => r.epoch === tr.voxel_best_epoch);
    const gs = st["full/graph"], vs = st["full/voxel"], tag = s => `<span class="tag ${s === "early_stopping" ? "ok" : "warn"}">${s === "early_stopping" ? "early stopping" : (s || "–").replace("_", " ")}</span>`;
    H.$("#train-cards").innerHTML =
      stat("Graph stage", `${g.length} <small>epochs</small>`, `best epoch ${tr.graph_best_epoch} · val Dice ${H.pct(gb && gb.val_dice, 2)}% · ${tag(gs)}`) +
      stat("Voxel stage", `${v.length} <small>epochs</small>`, `best epoch ${tr.voxel_best_epoch} · val Dice ${H.pct(vb && vb.val_dice, 2)}% · ${tag(vs)}`) +
      stat("Since best (graph / voxel)", `${g.length - tr.graph_best_epoch} / ${v.length - tr.voxel_best_epoch} <small>epochs</small>`, "patience was 15 epochs") +
      stat("Training time (full model)", H.hours(f.recorded_training_seconds), `graph ${H.hours(f.graph_training_seconds)} · voxel ${H.hours(f.recorded_training_seconds - f.graph_training_seconds)}`);
  }

  function curve(domId, legId, rows, series, hidden, best, stopReason, valKey, noteId) {
    const ser = series.map(s => ({ id: s.id, name: s.name, color: s.color, axis: s.axis, dash: s.dash, width: s.width, fmt: s.fmt, pts: rows.filter(r => r[s.key] != null).map(r => [r.epoch, r[s.key]]) }));
    C.legend(H.$(legId), ser.map(s => ({ id: s.id, name: s.name + (s.axis === 1 ? " (right axis)" : ""), color: s.color })), hidden, () => curve(domId, legId, rows, series, hidden, best, stopReason, valKey, noteId));
    const last = rows[rows.length - 1].epoch, hasLoss = ser.some(s => s.axis === 1 && !hidden.has(s.id));
    C.lines(H.$(domId), {
      series: ser, hidden, xLabel: "epoch", yLabel: "Dice", y2Label: hasLoss ? "loss" : "", fmtY: v => (v * 100).toFixed(0) + "%", xName: "epoch", tipTitle: x => "epoch " + x, xmin: 1, xmax: last,
      vlines: [{ x: best, color: "#3ddc97", label: "best " + best }, ...(last !== best ? [{ x: last, color: stopReason === "early_stopping" ? "#ffb300" : "#ff4d4d", label: stopReason === "early_stopping" ? "early stop" : "epoch cap" }] : [])],
      marks: [{ series: valKey, x: best, color: "#3ddc97", label: "" }],
    });
  }

  function notes() {
    const tr = H.M.training, st = H.M.claims.stopping, g = tr.graph, v = tr.voxel, lastG = g[g.length - 1].epoch, lastV = v[v.length - 1].epoch;
    H.$("#tg-note").innerHTML = `Best checkpoint at epoch <b>${tr.graph_best_epoch}</b> (kept for evaluation). Training stopped at epoch <b>${lastG}</b>, ${lastG - tr.graph_best_epoch} epochs without improvement — <b>${st["full/graph"] === "early_stopping" ? "early stopping (patience 15) fired, so this stage converged under the protocol" : H.esc(st["full/graph"])}</b>. Validation Dice is measured on the full validation volumes.`;
    const at = e => { const r = v.find(q => q.epoch === e); return r ? H.pct(r.val_dice, 2) + "%" : "–"; };
    const win = v.filter(r => r.epoch > lastV - 20).map(r => r.val_dice), prior = v.filter(r => r.epoch <= lastV - 20).map(r => r.val_dice), gain = Math.max(...win) - Math.max(...prior);
    const capped = st["full/voxel"] === "epoch_cap";
    H.$("#tv-note").className = "note " + (capped ? "warn" : "");
    H.$("#tv-note").innerHTML = capped
      ? `<b>Epoch cap reached.</b> The refinement stage ran all ${lastV} epochs; the best epoch was ${tr.voxel_best_epoch}, only ${lastV - tr.voxel_best_epoch} before the end. Val Dice: epoch 60 ${at(60)} → 80 ${at(80)} → ${lastV} ${at(lastV)}; the best in the last 20 epochs beat everything earlier by ${H.sgn(gain * 100, 2)} pts. The curve is flattening (small late gain), so the practical impact is probably limited, but <b>the protocol does not count this stage as converged</b>: report it as epoch-capped.`
      : `Stopped at epoch ${lastV} (best ${tr.voxel_best_epoch}) by ${H.esc(st["full/voxel"])}.`;
  }

  function gallery() {
    const im = H.M.images, items = [];
    Object.entries(im.curves).forEach(([k, u]) => items.push([k.startsWith("slic") ? "SLIC pilot · " + k.replace("slic_pilot/", "").replace("_", " ") : H.mlabel(k) + " · training curves", u]));
    Object.entries(im.main).forEach(([k, u]) => items.push(["main run · " + k.replace(/_/g, " "), u]));
    H.$("#curve-gallery").innerHTML = items.map(([c, u]) => `<figure data-u="${u}" data-c="${H.esc(c)}"><img loading="lazy" alt="${H.esc(c)}" src="${u}"><figcaption>${H.esc(c)}</figcaption></figure>`).join("");
    H.$("#curve-gallery").onclick = e => { const f = e.target.closest("figure"); if (f) H.openModal(f.dataset.c, f.dataset.u); };
  }

  H.views.train = {
    init() { cards(); notes(); gallery(); },
    show() {
      const tr = H.M.training, st = H.M.claims.stopping;
      curve("#chart-tg", "#tg-legend", tr.graph, [
        { id: "val_dice", key: "val_dice", name: "val Dice", color: "#ffb300", width: 2.5 }, { id: "train_loss", key: "train_loss", name: "train loss", color: "#4cc9f0", axis: 1, dash: "5 3" }, { id: "val_loss", key: "val_total", name: "val loss", color: "#a58bff", axis: 1, dash: "2 3" },
      ], T.gh, tr.graph_best_epoch, st["full/graph"], "val_dice");
      curve("#chart-tv", "#tv-legend", tr.voxel, [
        { id: "val_dice", key: "val_dice", name: "val Dice", color: "#ffb300", width: 2.5 }, { id: "train_patch", key: "train_patch_dice", name: "train patch Dice", color: "#3ddc97", dash: "5 3" }, { id: "train_loss", key: "train_loss", name: "train loss", color: "#4cc9f0", axis: 1, dash: "5 3" }, { id: "val_loss", key: "val_loss", name: "val loss", color: "#a58bff", axis: 1, dash: "2 3" },
      ], T.vh, tr.voxel_best_epoch, st["full/voxel"], "val_dice");
    },
  };
})();
