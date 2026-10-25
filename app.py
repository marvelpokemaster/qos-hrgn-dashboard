#!/usr/bin/env python3
"""Zero-dependency local server for the QoS-HRGN research HUD.

    python app.py                 # http://localhost:8000, opens the browser
    python app.py --port 8080 --no-browser
    python app.py --host 0.0.0.0  # share on your LAN (e.g. for a lab meeting)

Chatbot (optional): set GEMINI_API_KEY (Google AI Studio key) before starting, or paste a key in the chat
panel's settings (kept in your browser only, sent to this local server, never stored on disk).
    set GEMINI_API_KEY=...        (Windows cmd)     $env:GEMINI_API_KEY="..."   (PowerShell)
    QOS_CHAT_MODEL=gemini-2.5-flash   (default; any model your key can use)

Routes
    /                  static/index.html
    /static/...        front-end assets
    /data/...          manifest.json, hops.json, panels/, extracted figures
    /api/manifest      alias of /data/manifest.json
    /api/chat          POST - proxy to Google AI (Gemini); /api/chat/status, /api/chat/models
"""
from __future__ import annotations

import argparse
import json
import mimetypes
import os
import re
import sys
import threading
import urllib.error
import urllib.request
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
DATA = ROOT / "data"

GEMINI_BASE = os.environ.get("QOS_CHAT_BASE", "https://generativelanguage.googleapis.com/v1beta").rstrip("/")
DEFAULT_MODEL = os.environ.get("QOS_CHAT_MODEL", "gemini-2.5-flash")
SERVER_KEY = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or ""
SERVER_KEY_OK = True        # set False in main() when serving on a non-loopback address without --share-key
MAX_BODY = 600_000
MODEL_RE = re.compile(r"^[A-Za-z0-9._-]{1,80}$")

mimetypes.add_type("application/json", ".json")
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/css", ".css")


class Handler(SimpleHTTPRequestHandler):
    ALIASES = {"/api/manifest": "/data/manifest.json", "/api/metrics": "/data/manifest.json",
               "/api/slic": "/data/manifest.json", "/api/patients": "/data/manifest.json"}

    def translate_path(self, path: str) -> str:                       # noqa: D401
        p = unquote(urlparse(path).path)
        p = self.ALIASES.get(p, p)
        if p in ("/", "/index.html"):
            return str(STATIC / "index.html")
        for prefix, base in (("/static/", STATIC), ("/data/", DATA)):
            if p.startswith(prefix):
                target = (base / p[len(prefix):]).resolve()
                if base.resolve() in target.parents or target == base.resolve():   # no path traversal
                    return str(target)
                return str(STATIC / "__forbidden__")
        return str(STATIC / "__missing__")

    # ------------------------------------------------------------------ chat proxy
    def _send_json(self, code: int, obj: dict) -> None:
        raw = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _key(self) -> str:
        return (self.headers.get("X-Gemini-Key") or "").strip() or (SERVER_KEY if SERVER_KEY_OK else "")

    def _guard(self) -> bool:                      # custom header => cross-site pages cannot call this (needs CORS preflight)
        if self.headers.get("X-HUD") != "1":
            self._send_json(403, {"error": "forbidden"})
            return False
        return True

    def _upstream(self, url: str, payload: dict | None, key: str) -> tuple[int, dict]:
        req = urllib.request.Request(url, data=None if payload is None else json.dumps(payload).encode(),
                                     headers={"Content-Type": "application/json", "x-goog-api-key": key})
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                return r.status, json.loads(r.read().decode("utf-8", "replace") or "{}")
        except urllib.error.HTTPError as e:
            try:
                msg = json.loads(e.read().decode("utf-8", "replace")).get("error", {}).get("message", "")
            except Exception:
                msg = ""
            return e.code, {"error": msg or f"upstream HTTP {e.code}"}
        except Exception as e:                      # network down, DNS, timeout ...
            return 502, {"error": f"could not reach the Google AI API ({type(e).__name__}: {e})"}

    def do_GET(self):                               # noqa: N802
        p = urlparse(self.path).path
        if p == "/api/chat/status":
            return self._send_json(200, {"server_key": bool(SERVER_KEY and SERVER_KEY_OK), "model": DEFAULT_MODEL})
        if p == "/api/chat/models":
            if not self._guard():
                return
            key = self._key()
            if not key:
                return self._send_json(400, {"error": "no API key"})
            code, d = self._upstream(f"{GEMINI_BASE}/models?pageSize=200", None, key)
            if code != 200:
                return self._send_json(code, d)
            names = sorted(m["name"].split("/", 1)[-1] for m in d.get("models", []) if "generateContent" in m.get("supportedGenerationMethods", []))
            return self._send_json(200, {"models": names})
        return super().do_GET()

    def do_POST(self):                              # noqa: N802
        if urlparse(self.path).path != "/api/chat":
            return self._send_json(404, {"error": "not found"})
        if not self._guard():
            return
        try:
            n = int(self.headers.get("Content-Length") or 0)
            if n <= 0 or n > MAX_BODY:
                return self._send_json(413, {"error": "request too large"})
            body = json.loads(self.rfile.read(n).decode("utf-8"))
            msgs = [m for m in body.get("messages", []) if m.get("role") in ("user", "assistant") and isinstance(m.get("content"), str) and m["content"].strip()][-16:]
            if not msgs or msgs[-1]["role"] != "user":
                return self._send_json(400, {"error": "last message must be from the user"})
            model = str(body.get("model") or DEFAULT_MODEL)
            if not MODEL_RE.match(model):
                return self._send_json(400, {"error": "bad model name"})
        except Exception:
            return self._send_json(400, {"error": "bad request"})
        key = self._key()
        if not key:
            return self._send_json(401, {"error": "No API key. Open the chat settings and paste a Google AI Studio key, or start the server with GEMINI_API_KEY set."})
        payload = {
            "contents": [{"role": "model" if m["role"] == "assistant" else "user", "parts": [{"text": m["content"][:8000]}]} for m in msgs],
            "generationConfig": {"temperature": 0.3, "maxOutputTokens": 2048},
        }
        system = str(body.get("system") or "")[:80_000]
        if system:
            payload["systemInstruction"] = {"parts": [{"text": system}]}
        code, d = self._upstream(f"{GEMINI_BASE}/models/{model}:generateContent", payload, key)
        if code != 200:
            hint = {400: "Bad request or invalid key.", 401: "Key rejected.", 403: "Key rejected or API not enabled for this key.", 404: f"Model '{model}' not found - pick another in settings.", 429: "Rate limit / quota reached - wait a bit or use another model."}.get(code, "")
            return self._send_json(code, {"error": (d.get("error") or "upstream error") + (" — " + hint if hint else "")})
        cands = d.get("candidates") or []
        text = "".join(p.get("text", "") for p in ((cands[0].get("content") or {}).get("parts") or [])) if cands else ""
        if not text:
            why = (d.get("promptFeedback") or {}).get("blockReason") or (cands[0].get("finishReason") if cands else "") or "empty response"
            return self._send_json(200, {"text": f"(No answer returned: {why}.)", "model": model, "empty": True})
        self._send_json(200, {"text": text, "model": model})

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def log_message(self, fmt, *args):                                # quieter console
        if not args or not str(args[1]).startswith(("2", "3")):
            sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--no-browser", action="store_true")
    ap.add_argument("--share-key", action="store_true", help="allow GEMINI_API_KEY to be used by other machines when --host is not loopback")
    a = ap.parse_args()
    global SERVER_KEY_OK
    SERVER_KEY_OK = a.host in ("127.0.0.1", "localhost") or a.share_key
    if SERVER_KEY and not SERVER_KEY_OK:
        print("note: GEMINI_API_KEY ignored because the server is reachable from the network (use --share-key to allow)")

    if not (DATA / "manifest.json").exists():
        sys.exit("data/manifest.json is missing. Build it first:\n"
                 "    python extract_and_prepare.py --zip path/to/final_reports.zip\n"
                 "    (or put the extracted ZIP in data/extracted/ and run python extract_and_prepare.py)")
    srv = ThreadingHTTPServer((a.host, a.port), partial(Handler))
    url = f"http://{'localhost' if a.host in ('127.0.0.1', '0.0.0.0') else a.host}:{a.port}/"
    print(f"QoS-HRGN HUD running at {url}   (Ctrl+C to stop)")
    print("chat assistant: " + ("server key found" if SERVER_KEY and SERVER_KEY_OK else "no server key - paste one in the chat settings") + f" · model {DEFAULT_MODEL}")
    if not a.no_browser:
        threading.Timer(.6, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nbye")


if __name__ == "__main__":
    main()
