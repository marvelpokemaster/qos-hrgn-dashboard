import os, sys, json, zipfile, csv, urllib.request

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
EXTRACT_DIR = os.path.join(DATA_DIR, "extracted")
ZIP_PATH = os.path.join(DATA_DIR, "final_reports.zip")

HF_TOKEN = os.environ.get("HF_TOKEN", "")
REPO_ID = "marvelpokemaster/brats-qos-hrgn-model"
MODEL_HASH = "b36d43872a3781687ac7"
HF_URL = f"https://huggingface.co/{REPO_ID}/resolve/main/continuation_v8/{MODEL_HASH}/final_reports.zip"

def download_zip():
    if os.path.exists(ZIP_PATH) and os.path.getsize(ZIP_PATH) > 1000000:
        print(f"[OK] {ZIP_PATH} already exists ({os.path.getsize(ZIP_PATH)/1024/1024:.2f} MB). Skipping download.")
        return
    print(f"[FETCH] Downloading final_reports.zip from Hugging Face...")
    req = urllib.request.Request(HF_URL, headers={"Authorization": f"Bearer {HF_TOKEN}"})
    try:
        with urllib.request.urlopen(req) as resp:
            data = resp.read()
            with open(ZIP_PATH, "wb") as f:
                f.write(data)
        print(f"[OK] Downloaded {len(data)/1024/1024:.2f} MB to {ZIP_PATH}")
    except Exception as e:
        print(f"[ERROR] Failed to download directly: {e}")
        print("Trying with proxychains if needed...")
        sys.exit(1)

def extract_zip():
    os.makedirs(EXTRACT_DIR, exist_ok=True)
    print(f"[EXTRACT] Extracting {ZIP_PATH} to {EXTRACT_DIR}...")
    with zipfile.ZipFile(ZIP_PATH, "r") as z:
        z.extractall(EXTRACT_DIR)
    print(f"[OK] Extracted all files.")

def build_manifest():
    manifest = {
        "title": "QoS-HRGN Clinical PACS & Research Evaluation Workbench",
        "cohort": "BraTS 2021 (Held-out Test Cohort n=189)",
        "model_hash": MODEL_HASH,
        "kpis": {
            "wt_dice": 0.9226,
            "tc_dice": 0.8979,
            "et_dice": 0.8584,
            "wt_hd95": 5.4562,
            "tc_hd95": 4.5092,
            "et_hd95": 11.6128,
            "supervoxels": 15000,
            "test_cases": 189
        },
        "leaderboard": [],
        "patient_metrics": [],
        "qualitative_cases": [],
        "slic_pilot": [],
        "shapley": {},
        "hop_summary": {},
        "images": {
            "curves": {},
            "xai": {},
            "slic": {},
            "qualitative": {}
        }
    }

    # 1. Parse Leaderboard (test_summary.csv)
    ts_csv = os.path.join(EXTRACT_DIR, "research", "reports", "test_summary.csv")
    if os.path.exists(ts_csv):
        with open(ts_csv, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                manifest["leaderboard"].append(row)

    # 2. Parse Patient-Level Metrics (test_patients.csv)
    tp_csv = os.path.join(EXTRACT_DIR, "research", "reports", "test_patients.csv")
    if os.path.exists(tp_csv):
        with open(tp_csv, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                manifest["patient_metrics"].append(row)

    # 3. Parse SLIC Pilot (slic_pilot/reports/val_summary.csv)
    slic_csv = os.path.join(EXTRACT_DIR, "slic_pilot", "reports", "val_summary.csv")
    if os.path.exists(slic_csv):
        with open(slic_csv, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                manifest["slic_pilot"].append(row)

    # 4. Parse Shapley Summary
    shapley_json = os.path.join(EXTRACT_DIR, "reports", "region_shapley_summary.json")
    if os.path.exists(shapley_json):
        with open(shapley_json, "r", encoding="utf-8") as f:
            manifest["shapley"] = json.load(f)

    # 5. Parse Hop Summary
    hop_json = os.path.join(EXTRACT_DIR, "reports", "hop_summary.json")
    if os.path.exists(hop_json):
        with open(hop_json, "r", encoding="utf-8") as f:
            manifest["hop_summary"] = json.load(f)

    # 6. Parse Qualitative Patient Selection
    sel_json = os.path.join(EXTRACT_DIR, "research", "reports", "qualitative", "selection.json")
    if os.path.exists(sel_json):
        with open(sel_json, "r", encoding="utf-8") as f:
            sel_data = json.load(f)
            manifest["qualitative_cases"] = sel_data.get("selection", [])

    # 7. Map Image Assets
    for root, _, files in os.walk(EXTRACT_DIR):
        for file in files:
            if file.lower().endswith((".png", ".jpg", ".svg")):
                rel_path = os.path.relpath(os.path.join(root, file), EXTRACT_DIR)
                url_path = f"/data/extracted/{rel_path}"
                if "qualitative" in rel_path:
                    cid = file.replace(".png", "")
                    manifest["images"]["qualitative"][cid] = url_path
                elif "curves" in rel_path or "stage2_curves" in rel_path:
                    key = file.replace(".png", "")
                    manifest["images"]["curves"][key] = url_path
                elif "slic" in rel_path:
                    manifest["images"]["slic"][file] = url_path
                else:
                    manifest["images"]["xai"][file] = url_path

    out_path = os.path.join(DATA_DIR, "manifest.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    print(f"[OK] Generated {out_path} with {len(manifest['leaderboard'])} leaderboard models, {len(manifest['patient_metrics'])} patient metrics rows, and {len(manifest['qualitative_cases'])} qualitative cases.")

if __name__ == "__main__":
    download_zip()
    extract_zip()
    build_manifest()
