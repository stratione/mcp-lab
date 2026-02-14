"""Minimal Hello World HTTP server for MCP Lab pipeline demos."""

import json
from http.server import HTTPServer, BaseHTTPRequestHandler

VERSION = "1.0.0"


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            body = {"status": "ok"}
        elif self.path == "/":
            body = {"message": "Hello from MCP Lab!", "version": VERSION}
        else:
            self.send_response(404)
            self.end_headers()
            return

        payload = json.dumps(body).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    # Suppress per-request log lines
    def log_message(self, format, *args):
        pass


if __name__ == "__main__":
    server = HTTPServer(("0.0.0.0", 8080), Handler)
    print(f"hello-app v{VERSION} listening on :8080")
    server.serve_forever()
