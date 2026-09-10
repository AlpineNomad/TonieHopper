#!/usr/bin/env python3
"""Run the real plugin with an entirely local, synthetic TeddyCloud simulation."""

import argparse
import copy
import json
import mimetypes
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit


ROOT = Path(__file__).resolve().parent.parent
PLUGIN = ROOT / "plugin" / "toniehopper"
DEMO = ROOT / "docs" / "demo"
PREFIX = "/plugins/toniehopper/"
NOTICE = ('<div role="note" style="padding:7px 18px;text-align:center;'
          'font-size:12px;font-weight:800;color:#506080;background:#e1edf8">'
          'Lokale Demo · erfundene Kinder und Zuordnungen</div>')


class DemoServer(ThreadingHTTPServer):
    def __init__(self, address):
        self.lock = threading.Lock()
        self.config = json.loads((DEMO / "config.json").read_text(encoding="utf-8"))
        data = json.loads((DEMO / "library.json").read_text(encoding="utf-8"))
        self.files = data["files"]
        self.tags = data["tags"]
        self.catalog = data["catalog"]
        super().__init__(address, Handler)


class Handler(BaseHTTPRequestHandler):
    def send_bytes(self, data, content_type, status=200):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        # Demo data and all visual assets stay on this loopback origin.
        self.send_header("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; frame-ancestors 'self'")
        self.end_headers()
        self.wfile.write(data)

    def send_json(self, value, status=200):
        self.send_bytes(json.dumps(value, ensure_ascii=False).encode("utf-8"),
                        "application/json; charset=utf-8", status)

    def get_tag(self, query):
        ruid = query.get("ruid", [""])[0].lower()
        return next((tag for tag in self.server.tags if tag["ruid"] == ruid), None)

    def do_GET(self):
        parsed = urlsplit(self.path)
        path, query = unquote(parsed.path), parse_qs(parsed.query)
        if path == "/":
            self.send_response(302)
            self.send_header("Location", PREFIX + "index.html")
            self.end_headers()
            return
        if path == PREFIX + "config.json":
            self.send_json(self.server.config)
            return
        if path == "/api/toniesJson":
            self.send_json(self.server.catalog)
            return
        if path == "/api/getTagIndex":
            with self.server.lock:
                data = copy.deepcopy(self.server.tags)
            self.send_json({"tags": data})
            return
        if path == "/api/getTagInfo":
            with self.server.lock:
                tag = copy.deepcopy(self.get_tag(query))
            self.send_json({"tagInfo": tag}, 200 if tag else 404)
            return
        if path == "/api/fileIndexV2":
            files = self.server.files if query.get("special") == ["library"] and query.get("path", ["/"]) == ["/"] else []
            self.send_json({"files": files})
            return
        if path.startswith(PREFIX):
            base, relative = PLUGIN, path[len(PREFIX):]
        elif path.startswith("/demo/covers/"):
            base, relative = DEMO / "covers", path[len("/demo/covers/"):]
        else:
            self.send_error(404)
            return
        target = (base / relative).resolve()
        if not target.is_relative_to(base.resolve()) or not target.is_file():
            self.send_error(404)
            return
        data = target.read_bytes()
        if target == PLUGIN / "index.html":
            html = data.decode("utf-8").replace("<title>TonieHopper</title>", "<title>TonieHopper · Lokale Demo</title>")
            data = html.replace("</header>", "</header>" + NOTICE, 1).encode("utf-8")
        self.send_bytes(data, mimetypes.guess_type(target.name)[0] or "application/octet-stream")

    def do_POST(self):
        # No network client and no filesystem write exist in this handler.
        # Also reject cross-origin browser requests to this local simulation.
        parsed = urlsplit(self.path)
        origin = self.headers.get("Origin")
        port = self.server.server_port
        if origin and origin not in ("http://127.0.0.1:%s" % port, "http://localhost:%s" % port):
            self.send_error(403)
            return
        prefix = "/content/json/set/"
        if not parsed.path.startswith(prefix) or parse_qs(parsed.query).get("overlay"):
            self.send_error(404)
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= 8192:
                raise ValueError("Invalid body size")
            fields = parse_qs(self.rfile.read(size).decode("utf-8"), strict_parsing=True)
        except (ValueError, UnicodeError):
            self.send_error(400)
            return
        if set(fields) != {"source", "nocloud", "live"} or fields["nocloud"] != ["true"] or fields["live"] != ["false"] or len(fields["source"]) != 1:
            self.send_error(400)
            return
        source = fields["source"][0]
        item = next((file for file in self.server.files if "lib://" + file["name"] == source), None)
        if not item:
            self.send_error(404)
            return
        with self.server.lock:
            tag = self.get_tag({"ruid": [parsed.path[len(prefix):]]})
            if tag:
                tag.update(source=source, sourceInfo=copy.deepcopy(item["tonieInfo"]), nocloud=True, live=False)
        if not tag:
            self.send_error(404)
            return
        self.send_bytes(b"OK", "text/plain; charset=utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8770)
    args = parser.parse_args()
    if not 0 <= args.port <= 65535:
        parser.error("--port must be between 0 and 65535")
    server = DemoServer(("127.0.0.1", args.port))
    print("Lokale Demo: http://127.0.0.1:%s/ (nur erfundene Daten; Zuordnungen nur im Arbeitsspeicher)" % server.server_port, flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
