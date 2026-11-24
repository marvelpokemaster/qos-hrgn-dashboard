#!/usr/bin/env python3
"""Add the GraphSAGE + CNN follow-up row to data/manifest.json with per-patient scores.

Inputs (pulled from the Hugging Face ZIP stores with pull_followup_from_hub.py):
    <hub_extract>/evaluation/test/graphsage_hybrid/seed_42.json     per-patient test metrics (189 patients)
    <hub_extract>/advisor_followup/hgt_vs_sage_with_cnn.json        paired comparison vs the full model

What it does (idempotent; safe to re-run):
  * checks the file is complete, has 189 unique patients and the same ids as the manifest;
  * adds patients.rows[case]["graphsage_cnn"] = [Dice WT/TC/ET, HD95 WT/TC/ET] (4 decimals, like the other models);
  * replaces the rounded summary leaderboard row with exact means;
  * fills comparisons.vs_full.rows.graphsage_cnn (Dice WT/TC/ET/mean: diff, 95% CI, p, Holm);
    these use the follow-up run's own Holm family (7 metrics per comparison), not the 20-comparison main family;
  * marks the model no_cost (no params / timing record) instead of summary_only.

Usage:  python add_graphsage_cnn_patients.py [--hub ../hub_extract]
"""
import argparse
import json
import math
import os

COLS = ["Dice_WT", "Dice_TC", "Dice_ET", "HD95_WT", "HD95_TC", "HD95_ET"]


CURVE_KEY = "graphsage_cnn"
CURVE_URL = "/data/extracted/research/reports/curves/graphsage_cnn.png"   # drawn from runs/graphsage_hybrid/seed_42/trained.json protocols.graph/voxel history


def register_curve(manifest):
    """Idempotently list the GraphSAGE+CNN curve tile (image drawn from the Hub trained.json history)."""
    c = manifest["images"]["curves"]
    if CURVE_KEY not in c:
        items = []
        for k, v in c.items():
            items.append((k, v))
            if k == "cnn_only":
                items.append((CURVE_KEY, CURVE_URL))
        if CURVE_KEY not in dict(items):
            items.append((CURVE_KEY, CURVE_URL))
        manifest["images"]["curves"] = dict(items)


def apply(hub, manifest_path):
    ev = json.load(open(os.path.join(hub, "evaluation", "test", "graphsage_hybrid", "seed_42.json"), encoding="utf-8"))
    adv = json.load(open(os.path.join(hub, "advisor_followup", "hgt_vs_sage_with_cnn.json"), encoding="utf-8"))
    m = json.load(open(manifest_path, encoding="utf-8"))

    pts = ev["patients"]
    ids = [p["case_id"] for p in pts]
    assert ev.get("complete") is True, "evaluation file is not marked complete"
    assert len(pts) == 189 and len(set(ids)) == 189, "expected 189 unique patients, got %d/%d" % (len(pts), len(set(ids)))
    assert set(ids) == set(m["patients"]["rows"]), "patient ids differ from the manifest"
    assert m["patients"]["cols"] == COLS, "manifest column order changed"
    for p in pts:
        for c in COLS:
            v = p["metrics"][c]
            assert isinstance(v, (int, float)) and not math.isnan(v), "bad value %s for %s" % (c, p["case_id"])
    assert adv["n_patients"] == 189 and adv["seed"] == 42

    register_curve(m)

    # 1) per-patient rows
    for p in pts:
        m["patients"]["rows"][p["case_id"]]["graphsage_cnn"] = [round(float(p["metrics"][c]), 4) for c in COLS]
    models = m["patients"]["models"]
    if "graphsage_cnn" not in models:
        models.insert(models.index("cnn_only") + 1 if "cnn_only" in models else len(models), "graphsage_cnn")

    # 2) exact leaderboard means
    mean = lambda c: sum(float(p["metrics"][c]) for p in pts) / len(pts)
    row = {"experiment": "graphsage_cnn", "seed": 42, "n_patients": 189,
           "n_segments_per_partition": m["leaderboard"][0].get("n_segments_per_partition", 15000)}
    for c in COLS:
        row[c + "_mean"] = mean(c)
    m["leaderboard"] = [r for r in m["leaderboard"] if r.get("experiment") != "graphsage_cnn"] + [row]

    # 3) paired comparison (full minus GraphSAGE + CNN), follow-up run's own Holm family
    src = adv["comparisons"]["full - graphsage_hybrid"]
    rows = m["comparisons"]["vs_full"]["rows"]
    rows["graphsage_cnn"] = {k: {"diff": src[k]["mean_diff"], "ci": [src[k]["lo"], src[k]["hi"]], "p": src[k]["p"], "holm": src[k]["holm_p"]}
                             for k in ("Dice_WT", "Dice_TC", "Dice_ET", "Dice_mean")}

    # 4) model flags
    for mod in m["models"]:
        if mod["id"] == "graphsage_cnn":
            mod.pop("summary_only", None)
            mod["no_cost"] = True

    json.dump(m, open(manifest_path, "w", encoding="utf-8", newline="\n"), ensure_ascii=False, separators=(",", ":"))
    print("ok: graphsage_cnn per-patient rows added for 189 patients")
    print("mean Dice WT/TC/ET: %.4f %.4f %.4f  mean %.4f" % (row["Dice_WT_mean"], row["Dice_TC_mean"], row["Dice_ET_mean"],
          (row["Dice_WT_mean"] + row["Dice_TC_mean"] + row["Dice_ET_mean"]) / 3))
    d = rows["graphsage_cnn"]["Dice_mean"]
    print("full - graphsage_cnn mean Dice: %+.4f [%+.4f, %+.4f] p=%.4f holm=%.4f" % (d["diff"], d["ci"][0], d["ci"][1], d["p"], d["holm"]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--hub", default=os.path.join("..", "hub_extract"))
    ap.add_argument("--manifest", default=os.path.join("data", "manifest.json"))
    a = ap.parse_args()
    apply(a.hub, a.manifest)


if __name__ == "__main__":
    main()
