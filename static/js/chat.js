/* chat.js - HUD assistant: explains the project, the dashboard and the numbers.
   Talks to the local server (/api/chat), which forwards to Google AI (Gemini). The API key is either set on the
   server (GEMINI_API_KEY) or pasted in the panel settings (kept in this browser's localStorage only). */
"use strict";

(() => {
  const K_KEY = "qos.chat.key", K_MODEL = "qos.chat.model", DEFAULT_MODEL = "gemini-3.1-flash-lite";
  const st = { open: false, busy: false, msgs: [], serverKey: false, serverModel: DEFAULT_MODEL, models: [] };
  const ls = { get: k => { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }, set: (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) { /* private mode */ } } };

  const SUGGEST = {
    command: ["What do these headline numbers mean?", "Is the result statistically better than SegResNet?", "What are the main limitations of this study?"],
    scan: ["How do I read the overlay and the error panel?", "Why is the lowest-Dice case so low?", "What do the class colours mean?"],
    bench: ["Why is HD95 so large for enhancing tumour?", "What does the paired bootstrap CI show?", "Which differences are significant?"],
    graph: ["What is a hop and what do the gates α mean?", "Why does the graph here look random?", "What is the learned receptive field?"],
    xai: ["What is a Shapley value here?", "Which modality matters most and why?", "Why are hops higher for FLAIR nodes?"],
    train: ["Did training converge?", "What does the epoch cap warning mean?", "What is early stopping with patience 15?"],
    slic: ["What is SLIC and why 15k supervoxels?", "Is the SLIC pilot conclusive?", "How does node count affect cost?"],
  };

  const fx = (v, d = 2) => v == null || Number.isNaN(+v) ? "n/a" : (+v).toFixed(d);
  const pc = v => v == null ? "n/a" : (100 * v).toFixed(2) + "%";

  function dataBlock() {
    const M = H.M, k = M.kpis, o = [];
    o.push(`Cohort: ${M.cohort}. Split: ${M.split}. Stage-1 model hash prefix: ${M.model_hash.slice(0, 20)}. Single training seed (42).`);
    o.push(`Task: BraTS 2021 brain tumour segmentation (WT whole tumour, TC tumour core, ET enhancing tumour) from T1ce and FLAIR. Pipeline: SLIC supervoxels (${k.supervoxels} per partition, one partition per modality) -> typed heterogeneous graph (T1ce and FLAIR nodes; relations T1ce-spatial, FLAIR-spatial, T1ce<->FLAIR correspondence) -> HGT graph network with a learned 0-2 hop mixture and edge gates alpha -> node probabilities projected to voxels -> 3D CNN refinement. Average graph: ${Math.round(k.nodes)} nodes, ${Math.round(k.edges)} edges. Parameters: graph ${k.graph_params}, voxel CNN ${k.voxel_params}.`);
    o.push(`Headline (full model, test mean over patients): Dice WT ${pc(k.wt_dice)}, TC ${pc(k.tc_dice)}, ET ${pc(k.et_dice)}, mean ${pc(k.mean_dice)}; HD95 mm WT ${fx(k.wt_hd95)}, TC ${fx(k.tc_hd95)}, ET ${fx(k.et_hd95)}.`);
    o.push("MODELS (test cohort, patient means):");
    M.models.forEach(m => {
      const r = H.lb(m.id); if (!r) return;
      o.push(`- ${m.label} [${m.family}] ${m.desc} | Dice WT/TC/ET ${pc(r.Dice_WT_mean)}/${pc(r.Dice_TC_mean)}/${pc(r.Dice_ET_mean)} (patient SD ${fx(r.Dice_WT_patient_sd, 3)}/${fx(r.Dice_TC_patient_sd, 3)}/${fx(r.Dice_ET_patient_sd, 3)}) | HD95 mm ${fx(r.HD95_WT_mean)}/${fx(r.HD95_TC_mean)}/${fx(r.HD95_ET_mean)} | params graph ${r.graph_parameters || 0} voxel ${r.voxel_parameters || 0} | train h ${fx(r.recorded_training_seconds / 3600, 1)} | best epoch graph ${r.graph_best_epoch ?? "-"} voxel ${r.voxel_best_epoch ?? "-"} | stopping graph ${r.graph_stopping_reason || "-"} voxel ${r.voxel_stopping_reason || "-"} | inference ${fx(r.cached_graph_inference_seconds_mean)} s/patient, peak VRAM ${fx(r.inference_peak_cuda_bytes / 1e9, 1)} GB`);
    });
    const cmp = (name, ref, rows) => Object.entries(rows).forEach(([id, d]) => { const x = d.Dice_mean; if (x) o.push(`- ${name}: ${ref} minus ${H.mlabel(id)}: mean Dice diff ${fx(x.diff, 4)}, 95% patient-bootstrap CI [${fx(x.ci[0], 4)}, ${fx(x.ci[1], 4)}], Holm-adjusted p ${fx(x.holm, 3)}${x.ci[0] <= 0 && x.ci[1] >= 0 ? " (CI includes 0)" : " (CI excludes 0)"}; per-region: ` + ["WT", "TC", "ET"].map(g => d["Dice_" + g] ? `${g} ${fx(d["Dice_" + g].diff, 4)} [${fx(d["Dice_" + g].ci[0], 4)}, ${fx(d["Dice_" + g].ci[1], 4)}]` : "").join("; ")); });
    o.push("PAIRED COMPARISONS (Dice, conditional on this cohort/protocol/seed):");
    if (M.comparisons.vs_full) cmp("vs full", "Full", M.comparisons.vs_full.rows);
    if (M.comparisons.graph_only) cmp("graph-only controls", "Graph-only HGT", M.comparisons.graph_only.rows);
    o.push("CAVEATS FLAGGED BY THE DATA:"); (M.claims.notes || []).forEach(n => o.push(`- [${n.level}] ${n.text}`));
    const hs = M.hop_summary || {}; o.push(`EFFECTIVE HOPS (mean over patients of node-level learned hop in [0,2]; ${M.hop_scope}): ` + Object.entries(hs).map(([key, v]) => `${key} ${fx(v.patient_mean)}±${fx(v.patient_sd)}`).join(", "));
    const sh = M.shapley && M.shapley.summary; if (sh) o.push(`SHAPLEY (modality attribution, mean over ${Object.values(sh)[0].n_present} explained patients; modality order ${H.MOD.join(", ")}; values are raw, not normalised): ` + Object.entries(sh).map(([g, v]) => `${g} ${v.mean.map((x, i) => H.MOD[i] + " " + fx(x, 3)).join(" ")}`).join(" | "));
    if (M.slic && M.slic.rows) o.push(`SLIC PILOT (validation set, ${M.slic.rows[0].n_patients} patients, short epoch-capped runs - not conclusive): ` + M.slic.rows.slice().sort((a, b) => a.n_segments_per_partition - b.n_segments_per_partition).map(r => `${r.n_segments_per_partition} seg -> ~${Math.round(r.graph_nodes_mean)} nodes, Dice WT/TC/ET ${pc(r.Dice_WT_mean)}/${pc(r.Dice_TC_mean)}/${pc(r.Dice_ET_mean)}`).join("; "));
    o.push(`Runtime scope: ${M.runtime_scope}.`);
    return o.join("\n");
  }

  function viewBlock() {
    const M = H.M, tab = H.TABS.find(t => t.id === H.cur), o = [`The user is currently on the "${tab ? tab.label : H.cur}" tab.`];
    try {
      const sc = H.views.scan && H.views.scan._state, cs = M.qualitative.cases;
      if (H.cur === "scan" && sc && cs[sc.idx]) {
        const c = cs[sc.idx], row = M.patients.rows[c.case_id], cols = M.patients.cols;
        o.push(`Scan view: case ${c.case_id} (selected because: ${c.reason}); mode ${sc.mode}. Single axial slice shown for display only; metrics are full-volume.`);
        if (row) ["full", "no_voxel", "segresnet"].forEach(id => row[id] && o.push(`  ${H.mlabel(id)}: ` + cols.map((cn, i) => `${cn} ${fx(row[id][i], cn.startsWith("HD") ? 1 : 3)}`).join(", ")));
      }
      const gl = H.views.graph && H.views.graph._state;
      if (H.cur === "graph" && gl && gl.nodes.length) {
        o.push(`Graph Lab: schematic 3D sample with ${gl.N} nodes and ${gl.edges.length} edges (the real graph has ~${Math.round(M.kpis.nodes)} nodes / ~${Math.round(M.kpis.edges)} edges). Layout is random; hop and gate values are sampled from real aggregated test histograms. Colour mode: ${gl.color}; receptive field: ${gl.rf === "fixed" ? "fixed K=" + gl.K : "learned per node"}.`);
        if (gl.sel >= 0) { const n = gl.nodes[gl.sel]; o.push(`Selected node #${gl.sel}: ${n.t ? "FLAIR" : "T1ce"}, predicted class index ${n.pred} (0 background, 1 NCR/NET, 2 edema, 3 enhancing), effective hop ${fx(n.hop)}, degree ${n.nb.length}` + (gl.bfs ? `, receptive field node counts per hop ${gl.bfs.counts.join(" / ")}.` : ".")); }
      }
    } catch (e) { /* context is best-effort */ }
    return o.join("\n");
  }

  const RULES = `You are the built-in assistant of the QoS-HRGN research dashboard (BraTS 2021 brain-tumour segmentation using a typed heterogeneous supervoxel graph plus 3D CNN refinement). Help the user understand the project, this dashboard, the numbers shown, and the underlying concepts (graph neural networks, HGT, message passing, hops, edge gates, SLIC supervoxels, Shapley attribution, Dice/HD95/sensitivity/precision, bootstrap CIs, early stopping, ablations).
Rules:
- Treat the DATA block as ground truth for this project's numbers. If a number or fact is not in DATA, say you do not have it; never invent results, and label general background knowledge as general.
- Be concise: short paragraphs; bullets only when they help. Explain jargon in plain words. Give the number and its meaning.
- Be honest about limitations whenever relevant (single seed; voxel stage ended at the epoch cap so it is not shown to be converged; some CIs include 0; the SLIC study is a short pilot; the Graph Lab layout is a schematic).
- This is a research tool, not a medical device; do not give clinical advice.
- Answer in the language the user writes in.`;

  function systemPrompt() { return `${RULES}\n\n=== DATA ===\n${dataBlock()}\n\n=== CURRENT VIEW ===\n${viewBlock()}`; }

  /* tiny, safe markdown: escape first, then **bold**, `code`, lists, headings */
  function md(s) {
    const e = H.esc(s).replace(/```([\s\S]*?)```/g, (_, c) => `<pre>${c.replace(/^\w*\n/, "")}</pre>`).replace(/`([^`\n]+)`/g, "<code>$1</code>").replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>").replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:]|$)/g, "$1<i>$2</i>");
    const out = []; let list = null;
    e.split("\n").forEach(line => {
      const b = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/), ord = /^\s*\d+[.)]\s/.test(line);
      if (b) { const tag = ord ? "ol" : "ul"; if (list !== tag) { if (list) out.push(`</${list}>`); out.push(`<${tag}>`); list = tag; } out.push(`<li>${b[1]}</li>`); }
      else { if (list) { out.push(`</${list}>`); list = null; } const h = line.match(/^#{1,4}\s+(.*)$/); out.push(h ? `<p><b>${h[1]}</b></p>` : line.trim() ? `<p>${line}</p>` : ""); }
    });
    if (list) out.push(`</${list}>`); return out.join("").replace(/<\/pre><p>/g, "</pre><p>");
  }

  function el(html) { const d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstChild; }
  function bubble(role, html, cls = "") { const b = el(`<div class="cm ${role} ${cls}"><div class="cb">${html}</div></div>`); const box = H.$("#chat-log"); box.appendChild(b); box.scrollTop = box.scrollHeight; return b; }

  function chips() {
    const box = H.$("#chat-chips"), list = SUGGEST[H.cur] || SUGGEST.command;
    box.innerHTML = list.map(q => `<button class="chip-q">${H.esc(q)}</button>`).join("");
    box.style.display = st.msgs.length > 2 ? "none" : "";
  }

  function keyInfo() { const k = ls.get(K_KEY); return st.serverKey ? "server key" : k ? "browser key" : ""; }
  function setStatus() { const s = H.$("#chat-status"); if (!s) return; const k = keyInfo(); s.textContent = k ? `${ls.get(K_MODEL) || st.serverModel} · ${k}` : "no API key — open ⚙"; s.className = k ? "ok" : "warn"; }

  async function api(path, opts = {}) {
    const key = ls.get(K_KEY), h = { "X-HUD": "1", ...(opts.body ? { "Content-Type": "application/json" } : {}), ...(key ? { "X-Gemini-Key": key } : {}) };
    const r = await fetch(path, { method: opts.body ? "POST" : "GET", headers: h, body: opts.body ? JSON.stringify(opts.body) : undefined });
    let d = {}; try { d = await r.json(); } catch (e) { /* non-json */ }
    if (!r.ok) { const err = new Error(d.error || `HTTP ${r.status}`); err.status = r.status; throw err; }
    return d;
  }

  async function send(text) {
    text = (text || "").trim(); if (!text || st.busy) return;
    H.$("#chat-in").value = ""; autosize(); bubble("user", H.esc(text).replace(/\n/g, "<br>"));
    st.msgs.push({ role: "user", content: text }); st.busy = true; H.$("#chat-send").disabled = true; chips();
    const wait = bubble("bot", `<span class="typing"><i></i><i></i><i></i></span>`);
    try {
      const d = await api("/api/chat", { body: { messages: st.msgs, system: systemPrompt(), model: ls.get(K_MODEL) || st.serverModel } });
      wait.querySelector(".cb").innerHTML = md(d.text); if (!d.empty) st.msgs.push({ role: "assistant", content: d.text }); else st.msgs.pop();
    } catch (e) {
      st.msgs.pop(); wait.classList.add("err"); wait.querySelector(".cb").innerHTML = `<b>Could not get an answer.</b><br>${H.esc(e.message)}` + (e.status === 401 || e.status === 403 ? `<br><button class="chip-q" id="chat-open-set">Open settings</button>` : "");
      const b = wait.querySelector("#chat-open-set"); if (b) b.onclick = () => toggleSettings(true);
      if (e.status === 401) toggleSettings(true);
    }
    st.busy = false; H.$("#chat-send").disabled = false; H.$("#chat-log").scrollTop = 1e9; H.$("#chat-in").focus();
  }

  function autosize() { const t = H.$("#chat-in"); t.style.height = "auto"; t.style.height = Math.min(110, t.scrollHeight) + "px"; }
  function toggleSettings(on) { H.$("#chat-set").classList.toggle("on", on); if (on) H.$("#chat-keyin").focus(); }
  function toggle(on) { st.open = on === undefined ? !st.open : on; H.$("#chat").classList.toggle("on", st.open); H.$("#chat-fab").classList.toggle("hide", st.open); if (st.open) { chips(); setStatus(); setTimeout(() => H.$("#chat-in").focus(), 50); } }

  function build() {
    document.body.appendChild(el(`<button id="chat-fab" title="Ask the assistant (C)"><svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="4" fill="currentColor"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4" stroke="currentColor" stroke-width="1.5"/></svg><span>ASK</span></button>`));
    document.body.appendChild(el(`<aside id="chat" aria-label="Assistant">
      <header><div><b>HUD ASSISTANT</b><small id="chat-status"></small></div><div class="r"><button class="iconbtn" id="chat-gear" title="API key &amp; model">⚙</button><button class="iconbtn" id="chat-clear" title="New conversation">⟲</button><button class="iconbtn" id="chat-x" title="Close (Esc)">×</button></div></header>
      <div id="chat-set"><label>Google AI (Gemini) API key</label><input type="password" id="chat-keyin" placeholder="AIza… (stored only in this browser)" autocomplete="off" spellcheck="false">
        <label>Model</label><div class="row"><input id="chat-model" list="chat-models" placeholder="gemini-3.1-flash-lite" spellcheck="false"><datalist id="chat-models"></datalist><button class="iconbtn" id="chat-load">List models</button></div>
        <div class="row"><button class="iconbtn" id="chat-save">Save</button><button class="iconbtn" id="chat-forget">Forget key</button></div>
        <p>Get a free key at <b>aistudio.google.com/apikey</b>. The key goes to <i>your</i> local server, which calls Google; nothing is written to disk. You can instead start the server with the <code>GEMINI_API_KEY</code> environment variable. Questions are sent to Google together with this dashboard's numbers (no patient images).</p></div>
      <div id="chat-log"></div><div id="chat-chips"></div>
      <form id="chat-form"><textarea id="chat-in" rows="1" placeholder="Ask about the model, the numbers, the graph…  (Enter = send, Shift+Enter = new line)"></textarea><button id="chat-send" type="submit">➤</button></form>
    </aside>`));
    bubble("bot", md("Hi — I can explain the project, this dashboard and the numbers on screen (e.g. *what is a hop?*, *is the gain over SegResNet significant?*). I only know what is in this dashboard's data plus general ML background, and I'll say so when I don't know."));
    H.$("#chat-fab").onclick = () => toggle(true); H.$("#chat-x").onclick = () => toggle(false); H.$("#chat-gear").onclick = () => toggleSettings(!H.$("#chat-set").classList.contains("on"));
    H.$("#chat-clear").onclick = () => { st.msgs = []; H.$("#chat-log").innerHTML = ""; bubble("bot", "New conversation. What would you like to know?"); chips(); };
    H.$("#chat-form").onsubmit = e => { e.preventDefault(); send(H.$("#chat-in").value); };
    H.$("#chat-in").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(H.$("#chat-in").value); } if (e.key !== "Escape") e.stopPropagation(); });
    H.$("#chat-in").addEventListener("input", autosize);
    H.$("#chat-chips").onclick = e => { const b = e.target.closest("button"); if (b) send(b.textContent); };
    H.$("#chat-save").onclick = () => { const k = H.$("#chat-keyin").value.trim(); if (k) ls.set(K_KEY, k); ls.set(K_MODEL, H.$("#chat-model").value.trim() === st.serverModel ? "" : H.$("#chat-model").value.trim()); H.$("#chat-keyin").value = ""; H.$("#chat-keyin").placeholder = ls.get(K_KEY) || st.serverKey ? "key saved — paste a new one to replace" : "AIza… (stored only in this browser)"; setStatus(); toggleSettings(false); H.toast("Assistant settings saved"); };
    H.$("#chat-forget").onclick = () => { ls.set(K_KEY, ""); H.$("#chat-keyin").value = ""; H.$("#chat-keyin").placeholder = "AIza… (stored only in this browser)"; setStatus(); H.toast("Key removed from this browser"); };
    H.$("#chat-load").onclick = async () => { const k = H.$("#chat-keyin").value.trim(); if (k) ls.set(K_KEY, k); try { const d = await api("/api/chat/models"); st.models = d.models; H.$("#chat-models").innerHTML = d.models.map(m => `<option value="${H.esc(m)}">`).join(""); H.toast(`${d.models.length} models available to this key — pick one in the Model box`); H.$("#chat-model").focus(); } catch (e) { H.toast("Could not list models: " + e.message); } };
    H.$("#chat-model").value = ls.get(K_MODEL) || st.serverModel;
    addEventListener("keydown", e => { const t = (e.target.tagName || "").toLowerCase(); if (t === "input" || t === "textarea" || t === "select" || e.ctrlKey || e.metaKey || e.altKey) return; if (e.key === "c" || e.key === "C") { e.preventDefault(); toggle(); } });
    addEventListener("keydown", e => { if (e.key === "Escape" && st.open && !H.$("#palette.on, #modal.on")) toggle(false); });
    H.$$("#tabs button").forEach(b => b.addEventListener("click", () => setTimeout(chips, 50))); addEventListener("hashchange", () => setTimeout(chips, 50));
  }

  addEventListener("DOMContentLoaded", async () => {
    build();
    try { const r = await fetch("/api/chat/status"); const d = await r.json(); st.serverKey = !!d.server_key; st.serverModel = d.model || DEFAULT_MODEL; if (!ls.get(K_MODEL)) H.$("#chat-model").value = st.serverModel; } catch (e) { /* static hosting without the server: chat disabled below */ }
    setStatus();
  });
  H.chat = { open: () => toggle(true), ask: q => { toggle(true); send(q); } };
})();
