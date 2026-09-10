#!/usr/bin/env python3
"""Local plugin preview. Only GET requests are proxied to TeddyCloud."""
import argparse
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--port', type=int, default=8766)
parser.add_argument('--teddycloud', required=True, help='HTTP(S)-Adresse der eigenen TeddyCloud')
parser.add_argument('--config', type=Path, default=ROOT / 'config/toniehopper.json', help='Konfiguration nur für diese lokale Vorschau lesen')
args = parser.parse_args()
origin = urlsplit(args.teddycloud)
if (origin.scheme not in ('http', 'https') or not origin.netloc
        or origin.path not in ('', '/') or origin.username or origin.password
        or origin.query or origin.fragment):
    parser.error('--teddycloud braucht eine HTTP(S)-Adresse ohne Zugangsdaten, Unterpfad oder URL-Zusätze')


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        path = urlsplit(self.path).path
        if path == '/':
            self.send_response(302)
            self.send_header('Location', '/plugins/toniehopper/index.html')
            self.end_headers()
            return
        if path == '/plugins/toniehopper/config.json':
            data = args.config.read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(data)
            return
        endpoints = ('/api/getTagIndex', '/api/getTagInfo', '/api/fileIndexV2', '/api/toniesJson')
        if path in endpoints or path.startswith('/cache/'):
            try:
                with urlopen(args.teddycloud.rstrip('/') + self.path, timeout=15) as response:
                    data = response.read()
                    self.send_response(200)
                    self.send_header('Content-Type', response.headers.get('Content-Type', 'application/octet-stream'))
                    self.send_header('Cache-Control', 'no-store' if path in endpoints else 'max-age=3600')
                    self.end_headers()
                    self.wfile.write(data)
            except (HTTPError, URLError, TimeoutError) as error:
                self.send_error(502, 'TeddyCloud konnte nicht gelesen werden')
            return
        if not path.startswith('/plugins/toniehopper/'):
            self.send_error(404)
            return
        super().do_GET()

    def translate_path(self, path):
        relative = urlsplit(path).path.removeprefix('/plugins/toniehopper/')
        from urllib.parse import unquote
        target = (ROOT / 'plugin/toniehopper' / unquote(relative)).resolve()
        if not target.is_relative_to((ROOT / 'plugin/toniehopper').resolve()):
            return str(ROOT / 'plugin/toniehopper/404')
        return str(target)

    def do_POST(self):
        self.send_error(405, 'Die lokale Vorschau erlaubt keine TeddyCloud-Aenderungen')

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()


print('Lokale Vorschau: http://127.0.0.1:%s/ (TeddyCloud nur lesend)' % args.port, flush=True)
ThreadingHTTPServer(('127.0.0.1', args.port), Handler).serve_forever()
