#!/usr/bin/env python3
"""Add the GraphSAGE + CNN control to data/manifest.json (models, leaderboard, paired comparison).

Source: data/validation.json (tie.rows / tie.paired), compiled from the saved advisor-follow-up results.
This builds the summary row (Dice and HD95 means, one paired CI) from data/validation.json. When the follow-up files are
available, add_graphsage_cnn_patients.py runs afterwards and adds per-patient scores and the full paired comparison. Idempotent.
"""
import json
from pathlib import Path

D = Path(__file__).resolve().parent / "data"
ID = "graphsage_cnn"


def main():
    mp, vp = D / "manifest.json", D / "validation.json"
    m, v = json.loads(mp.read_text(encoding="utf-8")), json.loads(vp.read_text(encoding="utf-8"))
    row = next(r for r in v["tie"]["rows"] if r["label"].startswith("GraphSAGE"))
    m["models"] = [x for x in m["models"] if x["id"] != ID]
    idx = next(i for i, x in enumerate(m["models"]) if x["id"] == "cnn_only") + 1
    m["models"].insert(idx, {"id": ID, "label": "GraphSAGE + CNN", "short": "SAGE+CNN", "family": "graph control",
                             "desc": "Homogeneous GraphSAGE graph model followed by the same 3D CNN (follow-up run; per-patient scores are added by add_graphsage_cnn_patients.py when available).",
                             "no_cost": True})
    m["leaderboard"] = [r for r in m["leaderboard"] if r["experiment"] != ID]
    lb = {"experiment": ID, "seed": 42, "n_patients": 189, "n_segments_per_partition": 15000}
    for i, g in enumerate(("WT", "TC", "ET")):
        lb[f"Dice_{g}_mean"] = round(row[g] / 100, 4)
        lb[f"HD95_{g}_mean"] = row["hd95"][i]
    m["leaderboard"].append(lb)
    p = next(x for x in v["tie"]["paired"] if x["label"].startswith("HGT + CNN − GraphSAGE"))
    # QoS-HRGN minus GraphSAGE+CNN, same orientation as the other vs_full rows (points -> Dice fraction)
    m["comparisons"]["vs_full"]["rows"][ID] = {"Dice_mean": {"diff": p["diff"] / 100, "ci": [p["lo"] / 100, p["hi"] / 100],
                                                              "p": None, "holm": p["p"]}}
    mp.write_text(json.dumps(m, separators=(",", ":")), encoding="utf-8")
    print("[ok] added", ID, "to manifest.json")


if __name__ == "__main__":
    main()
