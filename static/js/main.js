/* main.js - bootstrap */
"use strict";

(async () => {
  try {
    H.initTabs(); H.initKeys(); H.initBg();
    await H.boot();                                  // loads the manifest while the boot sequence plays
    const M = H.M;
    H.$("#chips").innerHTML =
      `<span class="chip ok"><span class="dot"></span>online</span><span class="chip">${H.esc(M.cohort)}</span><span class="chip" title="Stage-1 model hash prefix">${H.esc(M.model_hash.slice(0, 8))}</span>` +
      `<button class="iconbtn" id="b-find" title="Find a patient (/)">Find /</button><button class="iconbtn" id="b-present" title="Presentation mode (F)">Present</button>`;
    H.$("#b-find").onclick = () => H.palette.open(); H.$("#b-present").onclick = () => { document.body.classList.toggle("present"); H.onResize.forEach(f => f()); };
    H.$("#foot-l").textContent = "QoS-HRGN · typed heterogeneous supervoxel graph + 3D CNN refinement · BraTS 2021 · single seed";
    H.$("#foot-r").textContent = `data generated ${M.generated.replace("T", " ").replace("+00:00", " UTC")} · all numbers read from final_reports.zip · research use only, not a medical device`;
    const start = location.hash.replace("#", "");
    H.go(H.views[start] ? start : "command", true);
  } catch (e) {
    console.error(e);
    const b = H.$("#boot"); if (b) b.remove();
    const f = H.$("#fatal"); f.classList.remove("hidden");
    f.innerHTML = `Could not start the dashboard: ${H.esc(e.message)}<br><br>Start it with <b>python app.py</b> (it needs the local server because it loads data/manifest.json) and build the data with <b>python extract_and_prepare.py</b>.`;
  }
})();
