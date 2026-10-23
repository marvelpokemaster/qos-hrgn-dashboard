#!/usr/bin/env python3
"""Build the dashboard data from the verified BraTS ``final_reports.zip``.

Usage (run from the repository root):

    python extract_and_prepare.py                       # use data/extracted/ if present
    python extract_and_prepare.py --zip path/to/final_reports.zip
    python extract_and_prepare.py --download            # fetch from the Hugging Face model repo
    HF_TOKEN=hf_xxx python extract_and_prepare.py --download   # private repo

Outputs (all consumed by static/js/*):

    data/manifest.json   leaderboard, patient metrics, comparisons, training history, SLIC pilot, ...
    data/hops.json       aggregated and per-patient hop / gate histograms (lazy loaded by the UI)
    data/panels/<case>/<0..4>.png   the five qualitative panels cut out of every montage

Nothing here is hard-coded: every number shown by the dashboard is read from the ZIP.
Python 3.8+; Pillow + numpy are optional (needed only to cut the qualitative montage into panels).
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import os
import shutil
import sys
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
EXTRACT_DIR = DATA_DIR / "extracted"
ZIP_PATH = DATA_DIR / "final_reports.zip"
PANEL_DIR = DATA_DIR / "panels"

REPO_ID = "marvelpokemaster/brats-qos-hrgn-model"
MODEL_HASH = "b36d43872a3781687ac7"
HF_URL = f"https://huggingface.co/{REPO_ID}/resolve/main/continuation_v8/{MODEL_HASH}/final_reports.zip"

PANEL_NAMES = ["T1ce", "Reference", "Graph only", "Graph + voxel", "Voxel error"]
REGIONS = ("WT", "TC", "ET")
PATIENT_COLS = ["Dice_WT", "Dice_TC", "Dice_ET", "HD95_WT", "HD95_TC", "HD95_ET"]

# Static description of the six evaluated rows (matches ADVISOR_SCOPE.md / RESEARCH_PLAN.md).
MODEL_INFO = {
    "full": dict(label="QoS-HRGN (graph + voxel)", short="Full", family="ours",
                 desc="Typed hetero-graph + HGT + learned 0-2 hop mixture, projected to voxels and refined by a 3D CNN."),
    "no_voxel": dict(label="Graph only", short="Graph", family="ablation",
                     desc="Same HGT graph model; node probabilities projected straight to voxels (no CNN refinement)."),
    "cnn_only": dict(label="CNN refinement only", short="CNN", family="ablation",
                     desc="Same refinement CNN without graph probability channels (MRI only)."),
    "graphsage_backbone": dict(label="GraphSAGE graph-only", short="SAGE", family="graph control",
                               desc="Ordinary GraphSAGE backbone instead of HGT, graph-only."),
    "fixed_shared_hops": dict(label="Fixed 2-hop graph-only", short="Fixed-hop", family="graph control",
                              desc="HGT with a fixed shared 2-hop propagation instead of the learned hop mixture, graph-only."),
    "segresnet": dict(label="SegResNet (MONAI)", short="SegResNet", family="baseline",
                      desc="Independent strong 3D voxel baseline trained on the same split."),
}


# ----------------------------------------------------------------------------- helpers
def num(v):
    """CSV string -> int/float/None (keeps non numeric strings)."""
    if v is None or v == "":
        return None
    try:
        f = float(v)
    except ValueError:
        return v
    return int(f) if f.is_integer() and "." not in str(v) and "e" not in str(v).lower() else f


def read_csv(path: Path):
    if not path.exists():
        return []
    with open(path, newline="", encoding="utf-8") as fh:
        return [{k: num(v) for k, v in row.items()} for row in csv.DictReader(fh)]


def read_json(path: Path, default=None):
    if not path.exists():
        return default
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def url(path: Path) -> str:
    """Web path for a file under data/ (always forward slashes, also on Windows)."""
    return "/data/" + path.relative_to(DATA_DIR).as_posix()


def rnd(x, nd=4):
    return None if x is None else round(float(x), nd)


# ----------------------------------------------------------------------------- source handling
def download_zip(token: str | None) -> None:
    ZIP_PATH.parent.mkdir(parents=True, exist_ok=True)
    print(f"[fetch] {HF_URL}")
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    req = urllib.request.Request(HF_URL, headers=headers)
    tmp = ZIP_PATH.with_suffix(".part")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp, open(tmp, "wb") as out:
            shutil.copyfileobj(resp, out, 1 << 20)          # streamed, never held in memory
    except urllib.error.HTTPError as exc:
        tmp.unlink(missing_ok=True)
        hint = " (set HF_TOKEN for a private repository)" if exc.code in (401, 403, 404) and not token else ""
        sys.exit(f"[error] download failed: HTTP {exc.code}{hint}")
    except Exception as exc:                                 # noqa: BLE001
        tmp.unlink(missing_ok=True)
        sys.exit(f"[error] download failed: {exc}")
    tmp.replace(ZIP_PATH)
    print(f"[ok] {ZIP_PATH} ({ZIP_PATH.stat().st_size / 2**20:.1f} MB)")


def safe_extract(zip_path: Path, target: Path) -> None:
    target.mkdir(parents=True, exist_ok=True)
    root = target.resolve()
    with zipfile.ZipFile(zip_path) as zf:
        for member in zf.infolist():
            dest = (target / member.filename).resolve()
            if root not in dest.parents and dest != root:
                sys.exit(f"[error] unsafe path in ZIP: {member.filename}")
        zf.extractall(target)
    print(f"[ok] extracted {zip_path.name} -> {target}")


# ----------------------------------------------------------------------------- panels
def cut_panels(case_png: Path, out_dir: Path):
    """The research notebook saves one 2880x720 montage per case: five matplotlib axes.
    Cut them into five PNGs so the viewer can overlay / compare / blink them."""
    try:
        from PIL import Image
        import numpy as np
    except ImportError:
        return None
    img = Image.open(case_png).convert("RGB")
    arr = np.asarray(img).astype(int)
    h, w = arr.shape[:2]
    # The right-most panel (prediction error, 'Reds' colormap) has a near-white background: that
    # gives the exact axes box without being fooled by the white title text.
    light = arr.min(axis=2) > 200
    x_lo = int(w * 0.78)
    colfrac = light[int(h * 0.2):, :].mean(axis=0)
    cols = np.where(colfrac[x_lo:] > 0.5)[0]
    if len(cols) < 50:
        return None
    x0, x1 = x_lo + int(cols.min()), x_lo + int(cols.max()) + 1
    rowfrac = light[:, x0:x1].mean(axis=1)
    rows = np.where(rowfrac > 0.8)[0]
    if len(rows) < 50:
        return None
    y0, y1 = int(rows.min()), int(rows.max()) + 1
    pw = x1 - x0
    # The T1ce panel is the first axes; its brain image spans the whole axes width (mask > background).
    band = arr[y0:y1, : int(w * 0.22), :].sum(axis=2) > 30
    fc = np.where(band.mean(axis=0) > 0.3)[0]
    if len(fc) < 50:
        return None
    c_first = (int(fc.min()) + int(fc.max()) + 1) / 2
    c_last = (x0 + x1) / 2
    pitch = (c_last - c_first) / 4
    out_dir.mkdir(parents=True, exist_ok=True)
    urls = []
    for i in range(5):
        cx = c_first + pitch * i
        box = (int(round(cx - pw / 2)), y0, int(round(cx - pw / 2)) + pw, y1)
        dest = out_dir / f"{i}.png"
        img.crop(box).save(dest, optimize=True)
        urls.append(url(dest))
    return urls


# ----------------------------------------------------------------------------- build
def build(extract_dir: Path, with_panels: bool = True):
    research = extract_dir / "research" / "reports"
    reports = extract_dir / "reports"
    pilot = extract_dir / "slic_pilot" / "reports"

    leaderboard = read_csv(research / "test_summary.csv")
    if not leaderboard:
        sys.exit(f"[error] {research / 'test_summary.csv'} not found - is the ZIP extracted in {extract_dir}?")
    full = next((r for r in leaderboard if r["experiment"] == "full"), leaderboard[0])

    # ---- patients (compact: id -> model -> [6 numbers])
    patients, models_seen = {}, []
    for row in read_csv(research / "test_patients.csv"):
        m, cid = row["experiment"], row["case_id"]
        if m not in models_seen:
            models_seen.append(m)
        patients.setdefault(cid, {})[m] = [rnd(row.get(c)) for c in PATIENT_COLS]
    patients_out = {"cols": PATIENT_COLS, "models": models_seen, "rows": patients}

    # ---- paired comparisons (patient bootstrap + sign flip, produced by the notebooks)
    report = read_json(research / "test_report.json", {})
    comparisons = {}
    for block, key in (("comparisons", "vs_full"), ("graph_only_controls", "graph_only")):
        data = (report.get(block) or {})
        comparisons[key] = {
            "n_patients": data.get("n_patients"), "ci_scope": data.get("ci_scope"), "ci_unit": data.get("ci_unit"),
            "rows": {ctrl: {met: dict(diff=rnd(d.get("reference_minus_control"), 5), ci=[rnd(x, 5) for x in d.get("ci95", [None, None])],
                                      p=rnd(d.get("paired_sign_flip_p"), 5), holm=rnd(d.get("holm_adjusted_p"), 5))
                            for met, d in mets.items()}
                     for ctrl, mets in (data.get("comparisons") or {}).items()},
        }

    # ---- training history (interactive curves)
    hist = read_json(reports / "main_training_history.json", {})
    def keep(rows, keys):
        return [{k: rnd(r.get(k), 5) for k in keys} for r in rows]
    training = {
        "graph": keep(hist.get("graph", []), ["epoch", "train_loss", "val_total", "val_dice", "train_node_proxy", "val_node_proxy", "lr", "epoch_seconds"]),
        "voxel": keep(hist.get("refinement", []), ["epoch", "train_loss", "val_loss", "val_dice", "train_patch_dice", "lr", "seconds"]),
        "graph_best_epoch": hist.get("graph_best_epoch"),
        "voxel_best_epoch": hist.get("refinement_best_epoch"),
    }

    # ---- SHAP + hop summary
    shap_summary = read_json(reports / "region_shapley_summary.json", {})
    shap_patients = []
    for p in sorted((reports / "xai").glob("*.json")):
        d = read_json(p, {})
        shap_patients.append({"case_id": d.get("case_id", p.stem), "regions": d.get("regions"), "efficiency_error": d.get("efficiency_error")})
    hop_summary = read_json(reports / "hop_summary.json", {})

    # ---- hop / gate histograms
    hops = {"bins": None, "gate_bins": None, "aggregate": {}, "gates": {}, "patients": {}}
    for p in sorted((reports / "nodes").glob("*.json")):
        d = read_json(p, {})
        cid = d.get("case_id", p.stem)
        per = {}
        for nt, regs in d.get("hops", {}).items():
            for reg, h in regs.items():
                hops["bins"] = hops["bins"] or [rnd(b, 3) for b in h["bins"]]
                per.setdefault(nt, {})[reg] = [h["n"], rnd(h["mean"]), h["hist"]]
                a = hops["aggregate"].setdefault(nt, {}).setdefault(reg, {"n": 0, "wsum": 0.0, "hist": [0] * len(h["hist"]), "patients": 0})
                a["n"] += h["n"]; a["wsum"] += (h["mean"] or 0.0) * h["n"]; a["patients"] += 1 if h["n"] else 0
                a["hist"] = [x + y for x, y in zip(a["hist"], h["hist"])]
        hops["patients"][cid] = per
        for rel, parts in d.get("gates", {}).items():
            for part, h in parts.items():
                hops["gate_bins"] = hops["gate_bins"] or [rnd(b, 3) for b in h["bins"]]
                g = hops["gates"].setdefault(rel, {}).setdefault(part, {"n": 0, "wsum": 0.0, "hist": [0] * len(h["hist"])})
                g["n"] += h["n"]; g["wsum"] += (h["mean"] or 0.0) * h["n"]
                g["hist"] = [x + y for x, y in zip(g["hist"], h["hist"])]
    for tbl in (hops["aggregate"], hops["gates"]):
        for grp in tbl.values():
            for a in grp.values():
                a["mean"] = rnd(a["wsum"] / a["n"]) if a["n"] else None
                a.pop("wsum")

    # ---- qualitative cases (+ panel slicing)
    sel = read_json(research / "qualitative" / "selection.json", {})
    qualitative = []
    for item in sel.get("selection", []):
        cid = item["case_id"]
        png = research / "qualitative" / f"{cid}.png"
        if not png.exists():
            continue
        rec = dict(case_id=cid, reason=item.get("reason"), montage=url(png), panels=None)
        if with_panels:
            rec["panels"] = cut_panels(png, PANEL_DIR / cid)
        qualitative.append(rec)

    # ---- SLIC pilot
    slic = read_csv(pilot / "val_summary.csv")

    # ---- images
    images = {"curves": {}, "xai": {}, "slic": {}, "main": {}}
    for sub, key in ((research / "curves", "curves"), (reports, "xai"), (pilot, "slic"), (extract_dir / "main" / "figures", "main")):
        if sub.exists():
            for p in sorted(sub.glob("*.png")):
                images[key][p.stem] = url(p)
    for p in sorted((pilot / "curves").glob("*.png")) if (pilot / "curves").exists() else []:
        images["curves"]["slic_pilot/" + p.stem] = url(p)

    # ---- scope / claims (read, never invented)
    claims = read_json(reports / "claims_scope.json", {})
    scope = read_json(reports / "scope.json", {})
    pilot_scope = read_json(reports / "slic_pilot_scope.json", {})
    stopping = claims.get("stopping_reasons", {})
    notes = []
    for k, v in stopping.items():
        if v == "epoch_cap":
            notes.append(dict(level="warn", text=f"{k} stopped at the epoch cap (not early stopping): convergence is not demonstrated for this stage."))
    if claims.get("single_seed"):
        notes.append(dict(level="warn", text="Single training seed - no seed-to-seed variance is available."))
    if claims.get("slic_is_validation_pilot"):
        notes.append(dict(level="info", text="The SLIC resolution study is a short validation-set pilot, not a definitive optimum."))
    seg = next((r for r in leaderboard if r["experiment"] == "segresnet"), None)
    vs = comparisons["vs_full"]["rows"].get("segresnet", {}).get("Dice_mean")
    if seg and vs and vs["ci"][0] is not None and vs["ci"][0] <= 0 <= vs["ci"][1]:
        notes.append(dict(level="info", text="Full model vs SegResNet: mean-Dice difference is not distinguishable from zero (95% CI includes 0)."))

    kpis = {
        "wt_dice": full["Dice_WT_mean"], "tc_dice": full["Dice_TC_mean"], "et_dice": full["Dice_ET_mean"],
        "wt_hd95": full["HD95_WT_mean"], "tc_hd95": full["HD95_TC_mean"], "et_hd95": full["HD95_ET_mean"],
        "mean_dice": sum(full[f"Dice_{r}_mean"] for r in REGIONS) / 3,
        "supervoxels": full.get("n_segments_per_partition"), "nodes": full.get("graph_nodes_mean"),
        "edges": full.get("graph_edges_mean"), "test_cases": len(patients),
        "graph_params": full.get("graph_parameters"), "voxel_params": full.get("voxel_parameters"),
    }
    models = [dict(id=m, **MODEL_INFO.get(m, dict(label=m, short=m, family="other", desc=""))) for m in
              [r["experiment"] for r in leaderboard]]

    manifest = {
        "schema": 2,
        "title": "QoS-HRGN Research HUD",
        "cohort": f"BraTS 2021 held-out test cohort (n = {len(patients)})",
        "model_hash": MODEL_HASH,
        "split": report.get("split"),
        "generated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "runtime_scope": report.get("runtime_scope"),
        "kpis": kpis,
        "models": models,
        "leaderboard": leaderboard,
        "patients": patients_out,
        "comparisons": comparisons,
        "training": training,
        "shapley": {"summary": shap_summary, "patients": shap_patients, "scope": scope.get("xai_scope"),
                    "patient_ids": scope.get("xai_patient_ids", [])},
        "hop_summary": hop_summary,
        "hop_scope": scope.get("hop_scope"),
        "qualitative": {"cases": qualitative, "policy": sel.get("policy"), "panels": PANEL_NAMES},
        "slic": {"rows": slic, "scope": pilot_scope},
        "images": images,
        "claims": {"flags": claims, "stopping": stopping, "notes": notes},
    }
    DATA_DIR.mkdir(exist_ok=True)
    with open(DATA_DIR / "manifest.json", "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, separators=(",", ":"))
    with open(DATA_DIR / "hops.json", "w", encoding="utf-8") as fh:
        json.dump(hops, fh, separators=(",", ":"))
    n_panels = sum(1 for q in qualitative if q["panels"])
    print(f"[ok] manifest.json: {len(leaderboard)} models, {len(patients)} patients, {len(qualitative)} qualitative cases "
          f"({n_panels} cut into panels), {len(slic)} SLIC rows, {len(hops['patients'])} hop histograms")
    if with_panels and qualitative and not n_panels:
        print("[warn] Pillow/numpy not installed: the viewer falls back to the full montage (pip install pillow numpy).")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--zip", type=Path, help="local final_reports.zip to extract")
    ap.add_argument("--download", action="store_true", help="download the ZIP from the Hugging Face model repo")
    ap.add_argument("--extracted", type=Path, default=EXTRACT_DIR, help="folder with the extracted ZIP (default data/extracted)")
    ap.add_argument("--no-panels", action="store_true", help="skip cutting the qualitative montages into panels")
    args = ap.parse_args()

    if args.zip:
        safe_extract(args.zip, args.extracted)
    elif args.download:
        if not (ZIP_PATH.exists() and ZIP_PATH.stat().st_size > 10**6):
            download_zip(os.environ.get("HF_TOKEN", "").strip() or None)
        safe_extract(ZIP_PATH, args.extracted)
    elif not args.extracted.exists():
        sys.exit("[error] nothing to build from. Pass --zip <final_reports.zip>, --download, or place the extracted ZIP in data/extracted/")
    build(args.extracted, with_panels=not args.no_panels)


if __name__ == "__main__":
    main()
