import os, sys, json, mimetypes

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
STATIC_DIR = os.path.join(BASE_DIR, "static")
MANIFEST_PATH = os.path.join(DATA_DIR, "manifest.json")

def load_manifest():
    if os.path.exists(MANIFEST_PATH):
        with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"error": "Manifest not found. Run extract_and_prepare.py first."}

# Try FastAPI first
try:
    from fastapi import FastAPI
    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import JSONResponse, FileResponse
    from fastapi.middleware.cors import CORSMiddleware
    import uvicorn

    app = FastAPI(title="QoS-HRGN Clinical PACS & Research Dashboard", version="1.0.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/")
    async def serve_index():
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))

    @app.get("/api/manifest")
    async def get_manifest():
        return JSONResponse(load_manifest())

    @app.get("/api/metrics")
    async def get_metrics():
        m = load_manifest()
        return JSONResponse({
            "leaderboard": m.get("leaderboard", []),
            "kpis": m.get("kpis", {})
        })

    @app.get("/api/slic")
    async def get_slic():
        m = load_manifest()
        return JSONResponse({"slic_pilot": m.get("slic_pilot", [])})

    @app.get("/api/patients")
    async def get_patients():
        m = load_manifest()
        return JSONResponse({
            "qualitative_cases": m.get("qualitative_cases", []),
            "patient_metrics": m.get("patient_metrics", [])
        })

    # Mount static assets & extracted reports
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
    app.mount("/data", StaticFiles(directory=DATA_DIR), name="data")

    def run_fastapi(host="0.0.0.0", port=8000):
        print(f"\n=======================================================")
        print(f"  🧠 QoS-HRGN Clinical PACS & Research Dashboard")
        print(f"  Serving on: http://localhost:{port}")
        print(f"=======================================================\n")
        uvicorn.run(app, host=host, port=port)

except ImportError:
    # Standard Library Zero-Dependency Fallback
    from http.server import HTTPServer, SimpleHTTPRequestHandler
    import urllib.parse

    class PacsServerHandler(SimpleHTTPRequestHandler):
        def do_GET(self):
            parsed = urllib.parse.urlparse(self.path)
            path = parsed.path

            if path == "/" or path == "/index.html":
                self.serve_file(os.path.join(STATIC_DIR, "index.html"), "text/html")
            elif path == "/api/manifest":
                self.serve_json(load_manifest())
            elif path == "/api/metrics":
                m = load_manifest()
                self.serve_json({"leaderboard": m.get("leaderboard", []), "kpis": m.get("kpis", {})})
            elif path == "/api/slic":
                m = load_manifest()
                self.serve_json({"slic_pilot": m.get("slic_pilot", [])})
            elif path == "/api/patients":
                m = load_manifest()
                self.serve_json({"qualitative_cases": m.get("qualitative_cases", []), "patient_metrics": m.get("patient_metrics", [])})
            elif path.startswith("/static/"):
                rel = path[len("/static/"):]
                self.serve_file(os.path.join(STATIC_DIR, rel))
            elif path.startswith("/data/"):
                rel = path[len("/data/"):]
                self.serve_file(os.path.join(DATA_DIR, rel))
            else:
                self.send_error(404, "File not found")

        def serve_json(self, data):
            payload = json.dumps(data).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def serve_file(self, full_path, content_type=None):
            if not os.path.exists(full_path) or os.path.isdir(full_path):
                self.send_error(404, "File not found")
                return
            if not content_type:
                content_type, _ = mimetypes.guess_type(full_path)
            content_type = content_type or "application/octet-stream"
            try:
                with open(full_path, "rb") as f:
                    content = f.read()
                self.send_response(200)
                self.send_header("Content-Type", content_type)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                self.wfile.write(content)
            except Exception as e:
                self.send_error(500, str(e))

    def run_fastapi(host="0.0.0.0", port=8000):
        print(f"\n=======================================================")
        print(f"  🧠 QoS-HRGN Clinical PACS & Research Dashboard")
        print(f"  [Standard Library HTTP Server Mode]")
        print(f"  Serving on: http://localhost:{port}")
        print(f"=======================================================\n")
        server = HTTPServer((host, port), PacsServerHandler)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    run_fastapi(port=port)
