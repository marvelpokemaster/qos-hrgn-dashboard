# QoS-HRGN Research HUD

Interactive, dependency-free dashboard for the BraTS 2021 heterogeneous-supervoxel-graph segmentation project
(QoS-HRGN: typed graph + 3D CNN refinement). Iron-Man-style HUD; every number is read from the saved
`final_reports.zip`, nothing is hard-coded.

## Run

```bash
python extract_and_prepare.py --zip path/to/final_reports.zip   # once; builds data/manifest.json, hops.json, panels/
python app.py                                                  # http://localhost:8000  (--port, --host, --no-browser)
```
Requires only Python 3.9+ (Pillow + numpy for the prepare step). No npm, no CDN: works offline.
Data already built is included in `data/`, so `python app.py` works straight away.

## Views
| Key | View | What you can do |
|---|---|---|
| 1 | Command | KPI rings, honest claims panel generated from the data |
| 2 | Scan | overlay / grid / swipe on real test slices, wheel-zoom, drag-pan, per-pixel class readout, blink A/B, opacity, window/level, class toggles |
| 3 | Benchmark | sortable table with Δ vs reference, region bars, paired-bootstrap forest plot, patient dot plots (click → case), paired scatter |
| 4 | Graph Lab | 3D holographic graph: drag-rotate, zoom, hover, click a node → BFS receptive field (fixed K or learned hop), message pulses, gate histogram |
| 5 | Explain | Shapley / XAI views |
| 6 | Training | learning curves with best-epoch/stop markers, toggle series |
| 7 | SLIC | pilot results |

### Graph size (Graph Lab)
The **Graph size** slider (and 240 / 1k / 3k / 7.5k / 15k presets) sets the number of nodes in the 3D sample from **240 to 15,000**
(half T1ce, half FLAIR; 4-nearest-neighbour spatial edges per modality plus T1ce↔FLAIR correspondence edges). A spatial-hash
neighbour search builds 15k nodes in ~0.3 s; above 2,500 nodes edges are drawn in batches and nodes as small squares, and
*show all edges* can be switched off for maximum speed. The real graph has ≈30k nodes / ≈430k edges per patient.

### Chat assistant (Google AI / Gemini)
Press **C** (or the ASK button). The assistant knows this dashboard's numbers (models, paired CIs, stopping reasons, hops,
Shapley, SLIC pilot, caveats) plus what tab/case/node you are looking at, and says when it doesn't know something.
- Get a free key at https://aistudio.google.com/apikey, then either paste it in the panel's ⚙ settings (stored only in your
  browser) or start the server with it: `set GEMINI_API_KEY=...` (cmd) / `$env:GEMINI_API_KEY="..."` (PowerShell).
- Default model `gemini-2.5-flash`; ⚙ → *List models* shows what your key can use (or set `QOS_CHAT_MODEL`).
- The browser talks only to your local `app.py`, which calls Google (key never appears in page code or on disk).
  With `--host 0.0.0.0` the server-side env key is ignored unless you add `--share-key`.
- Questions + the dashboard's summary numbers are sent to Google; no patient images are sent.

Hotkeys: `1`–`7` views, `/` or `Ctrl+K` command palette, `O` `G` `S` scan modes, `B` blink, `F` present mode, `C` chat, `←`/`→` previous/next case, `?` help.

## Issues fixed versus the previous dashboard
- Missing `app.py` / broken run instructions; CDN dependencies (ECharts, Tailwind) that fail offline.
- Hard-coded / placeholder numbers replaced by values computed from the reports; Windows path separators in URLs.
- Stale `practical-v8` labels; the hybrid voxel stage is now flagged **epoch cap** (not converged) and single-seed / CI-includes-0 caveats are shown.
- Path-traversal guard in the server; null-region crashes in the data prep; chart tooltips/overflow and mobile layout; async init race in the Graph Lab.

## Honest limits
The Graph Lab topology is a **schematic**; hop counts and gate values are real samples from test-set histograms.
The qualitative slice is display-only. Shapley values are not normalised. HD95 has no paired CIs.
Research use only, not a medical device.
