# QoS-HRGN Clinical PACS & Research Dashboard

An interactive clinical PACS & research evaluation workbench built on your verified BraTS 2021 held-out test evaluation artifacts (`final_reports.zip`).

## Features
1. **Clinical PACS Viewer (Module 1)**: Interactive canvas viewer for qualitative multi-slice patient scans (Raw MRI anatomy, Ground Truth, QoS-HRGN Ours, SegResNet). Includes zoom, pan, brightness, contrast, invert, and opacity sliders.
2. **Benchmark & Statistical Explorer (Module 2)**: Leaderboard with interactive "Show Δ vs QoS-HRGN" delta badges, plus a live 189-patient swarm scatter chart where clicking any patient inspects their scan.
3. **Topological XAI Studio (Module 3)**: Exact Modality Shapley attribution charts with clinical callouts (FLAIR edema vs T1ce blood-brain barrier breakdown), plus local graph topology and adaptive hop distribution histograms.
4. **SLIC Pareto Frontier Lab (Module 4)**: Dual-axis Pareto curve comparing supervoxel resolution (5k -> 10k -> 15k -> 20k) against accuracy and graph complexity.
5. **Presentation Mode**: Press `F` to toggle full-screen presentation mode during advisor meetings or thesis defenses.

---

## How to Run

### Option 1: Standard Python (Zero Dependencies Needed)
```bash
cd qos_hrgn_dashboard
python3 app.py
```
Open your browser at **http://localhost:8000**

### Option 2: Using UV / FastAPI (High-Performance ASGI)
```bash
cd qos_hrgn_dashboard
uv run --with fastapi --with uvicorn python3 app.py
```

### Hotkeys & Shortcuts
- `1`, `2`, `3`, `4`: Switch between tabs
- `←` / `→` or `[` / `]`: Cycle previous / next patient case
- `F`: Toggle Fullscreen Presentation Mode
