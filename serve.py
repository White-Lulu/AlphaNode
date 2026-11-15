"""Start the local, read-only AlphaNode dashboard."""
import argparse
from collections import OrderedDict
from functools import partial
from hashlib import sha256
from http.client import HTTPConnection, HTTPException
from io import BytesIO
import json
import logging
import socket
import sys
from urllib.parse import parse_qs, urlsplit
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading
import webbrowser

from server.local_services import ServiceError, analyze, public_settings, remove_legacy_custom_settings, stock_price

ASSET_PREFIX = "/_ui/"
WORKBENCH_HEADER = "X-IndustryLab-Workbench"


class WorkbenchServer(ThreadingHTTPServer):
    allow_reuse_address = sys.platform != "win32"

    def server_bind(self):
        if sys.platform == "win32":
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


class Frontend:
    """Keep each HTML page and its module graph on the same asset revision."""

    def __init__(self, root):
        self.root = root
        self.installation = sha256(str(root.resolve()).casefold().encode("utf-8")).hexdigest()[:16]
        self.revisions = OrderedDict()
        self.lock = threading.Lock()

    def page(self):
        page = (self.root / "index.html").read_bytes()
        paths = [*self.root.glob("*.js"), *self.root.glob("*.css"), *self.root.glob("vendor/**/*.js")]
        files = {}
        digest = sha256(page)
        for path in sorted(paths):
            name = path.relative_to(self.root).as_posix()
            content = path.read_bytes()
            files[name] = content
            digest.update(name.encode("utf-8") + b"\0" + sha256(content).digest())
        revision = digest.hexdigest()[:16]
        with self.lock:
            self.revisions[revision] = files
            self.revisions.move_to_end(revision)
            if len(self.revisions) > 8:
                self.revisions.popitem(last=False)
        prefix = (ASSET_PREFIX + revision + "/").encode("ascii")
        for name in (b"app.js", b"styles.css", b"research.css", b"theme-preview.css"):
            page = page.replace(b'"' + name + b'"', b'"' + prefix + name + b'"')
        return page

    def asset(self, path):
        revision, _, name = path.removeprefix(ASSET_PREFIX).partition("/")
        with self.lock:
            return self.revisions.get(revision, {}).get(name)


class WorkbenchHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, frontend, **kwargs):
        self.frontend = frontend
        super().__init__(*args, **kwargs)

    def send_head(self):
        path = urlsplit(self.path).path
        if path in ("/", "/index.html"):
            return self.frontend_response(self.frontend.page(), "text/html; charset=utf-8", "no-store", page=True)
        if path.startswith(ASSET_PREFIX):
            content = self.frontend.asset(path)
            if content is None:
                self.send_error(404, "Workbench asset revision unavailable. Reload the page.")
                return None
            return self.frontend_response(content, self.guess_type(path), "public, max-age=31536000, immutable")
        return super().send_head()

    def frontend_response(self, content, content_type, cache_control, page=False):
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", cache_control)
        if page:
            self.send_header(WORKBENCH_HEADER, self.frontend.installation)
        self.end_headers()
        return BytesIO(content)

    def do_GET(self):
        url = urlsplit(self.path)
        if url.path == "/api/stock-price":
            code = parse_qs(url.query).get("code", [""])[0]
            return self.local_service(lambda: stock_price(code))
        if url.path == "/api/analysis-settings":
            if not self.same_origin_service():
                return self.reply(403, {"error": "LOCAL_ORIGIN_REQUIRED"})
            return self.local_service(public_settings)
        if url.path != "/api/screen":
            return super().do_GET()
        if len(url.query) > 16000:
            return self.reply(414, {"error": "Screening expression is too long"})
        params = parse_qs(url.query)
        expression = params.get("q", [""])[0].strip()
        try:
            year = int(params.get("year", [""])[0])
            if not expression or not 1900 <= year <= 2200:
                raise ValueError
        except ValueError:
            return self.reply(400, {"error": "Provide a screening expression and an observation year."})
        try:
            from advanced_screen import execute_screen, DslError
        except ImportError:
            logging.exception("Advanced screen dependencies are unavailable")
            return self.reply(503, {"error": "Local screening dependencies are unavailable."})
        try:
            ids = execute_screen(expression, year)
            return self.reply(200, {"ids": ids})
        except DslError as error:
            return self.reply(422, {"error": str(error), "position": error.position})
        except Exception:
            logging.exception("Could not query the local financial warehouse")
            return self.reply(503, {"error": "The local financial warehouse is unavailable."})

    def same_origin_service(self):
        host = self.headers.get("Host", "")
        origin = self.headers.get("Origin")
        return (host in (f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}")
                and origin in (None, "http://" + host) and self.headers.get("X-AlphaNode-Local") == "1")

    def do_POST(self):
        if urlsplit(self.path).path != "/api/chart-analysis":
            return self.reply(404, {"error": "UNKNOWN_ENDPOINT"})
        if not self.same_origin_service():
            return self.reply(403, {"error": "LOCAL_ORIGIN_REQUIRED"})
        try:
            length = int(self.headers.get("Content-Length", 0))
            if not 0 < length <= 256_000:
                return self.reply(413, {"error": "REQUEST_SIZE"})
            data = json.loads(self.rfile.read(length))
            if not isinstance(data, dict):
                raise ValueError
        except (ValueError, UnicodeError):
            return self.reply(400, {"error": "INVALID_JSON"})
        return self.local_service(lambda: analyze(data))

    def local_service(self, action):
        try:
            return self.reply(200, action())
        except ServiceError as error:
            return self.reply(error.status, {"error": str(error)})
        except Exception as error:
            logging.error("Local service failed (%s)", type(error).__name__)
            return self.reply(503, {"error": "LOCAL_SERVICE_UNAVAILABLE"})

    def reply(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

def already_running(port, installation):
    connection = HTTPConnection("127.0.0.1", port, timeout=2)
    try:
        connection.request("HEAD", "/")
        response = connection.getresponse()
        return response.status == 200 and response.getheader(WORKBENCH_HEADER) == installation
    except (OSError, HTTPException):
        return False
    finally:
        connection.close()

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port",type=int,default=8766)
    parser.add_argument("--no-browser",action="store_true")
    args=parser.parse_args()
    project=Path(__file__).resolve().parent
    sys.path.insert(0,str(project/"pipeline"))
    root=project/"dist"
    if not (root/"data/meta.json").is_file():
        parser.error("Generated data is missing. Run python pipeline/refresh.py first.")
    remove_legacy_custom_settings()
    frontend=Frontend(root)
    handler=partial(WorkbenchHandler,directory=str(root),frontend=frontend)
    try:
        server=WorkbenchServer(("127.0.0.1",args.port),handler)
    except OSError as error:
        if already_running(args.port,frontend.installation):
            url=f"http://127.0.0.1:{args.port}/"
            print(f"AlphaNode is already running: {url}",flush=True)
            if not args.no_browser:
                webbrowser.open(url)
            return
        parser.error(f"Port {args.port} is unavailable. Try --port {args.port+1}. {error}")
    url=f"http://127.0.0.1:{server.server_port}/"
    print(f"AlphaNode is ready: {url}",flush=True)
    if not args.no_browser:
        threading.Timer(.35,webbrowser.open,args=(url,)).start()
    try:
        with server:
            server.serve_forever()
    except KeyboardInterrupt:
        pass

if __name__=="__main__":
    main()
