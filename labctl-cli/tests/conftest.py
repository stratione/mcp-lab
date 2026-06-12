"""Test fixtures: stdlib http.server fakes for the registry v2 API, the
promotion service, and Gitea (contents API sha flow + actions tasks), plus a
monkeypatched subprocess helper. No containers needed."""

import base64
import json
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from types import SimpleNamespace
from urllib.parse import parse_qs, unquote, urlsplit

import pytest

from labctl_pkg import proc


# ── generic fake HTTP service ────────────────────────────────────────────────

class FakeService:
    def __init__(self, router, state=None):
        self.router = router
        self.state = state if state is not None else {}
        self.requests = []
        service = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def _handle(self, method):
                length = int(self.headers.get("Content-Length") or 0)
                body = self.rfile.read(length) if length else b""
                parts = urlsplit(self.path)
                record = {
                    "method": method,
                    "path": unquote(parts.path),
                    "query": parse_qs(parts.query),
                    "headers": {k: v for k, v in self.headers.items()},
                    "body": body,
                }
                service.requests.append(record)
                status, ctype, out, extra = service.router(method, record, service.state)
                self.send_response(status)
                if ctype:
                    self.send_header("Content-Type", ctype)
                for key, value in (extra or {}).items():
                    self.send_header(key, value)
                self.send_header("Content-Length", str(len(out)))
                self.end_headers()
                self.wfile.write(out)

            do_GET = lambda self: self._handle("GET")        # noqa: E731
            do_POST = lambda self: self._handle("POST")      # noqa: E731
            do_PUT = lambda self: self._handle("PUT")        # noqa: E731
            do_DELETE = lambda self: self._handle("DELETE")  # noqa: E731

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.url = "http://127.0.0.1:{}".format(self.server.server_port)
        self.thread = threading.Thread(
            target=lambda: self.server.serve_forever(poll_interval=0.02), daemon=True)
        self.thread.start()

    def stop(self):
        self.server.shutdown()
        self.server.server_close()


def _json(status, obj, extra=None):
    return status, "application/json", json.dumps(obj).encode(), extra


# ── registry v2 router ───────────────────────────────────────────────────────

def registry_router(method, record, state):
    path = record["path"]
    if path == "/v2/" or path == "/v2":
        return _json(200, {})
    if path == "/v2/_catalog":
        return _json(200, {"repositories": sorted(state["tags"])})
    if path.endswith("/tags/list"):
        name = path[len("/v2/"):-len("/tags/list")]
        if name in state["tags"]:
            return _json(200, {"name": name, "tags": state["tags"][name]})
        return _json(404, {"errors": [{"code": "NAME_UNKNOWN"}]})
    if "/manifests/" in path:
        name, _, ref = path[len("/v2/"):].partition("/manifests/")
        if method == "GET":
            entry = state["manifests"].get((name, ref))
            if not entry:
                return _json(404, {"errors": [{"code": "MANIFEST_UNKNOWN"}]})
            ctype, body = entry
            return 200, ctype, body, {"Docker-Content-Digest": "sha256:" + "ab" * 32}
        if method == "PUT":
            state["manifests"][(name, ref)] = (record["headers"].get("Content-Type", ""),
                                               record["body"])
            state["tags"].setdefault(name, [])
            if ref not in state["tags"][name]:
                state["tags"][name].append(ref)
            return 201, "text/plain", b"", {"Docker-Content-Digest": "sha256:" + "ab" * 32}
    return _json(404, {"message": "not found"})


# ── promotion service router ─────────────────────────────────────────────────

def promotion_router(method, record, state):
    path = record["path"]
    body = json.loads(record["body"]) if record["body"] else {}
    if path == "/health":
        return _json(200, {"status": "ok", "service": "promotion-service"})
    if path == "/policy":
        return _json(200, state["policy"])
    if path == "/promote" and method == "POST":
        if state.get("block"):
            return _json(409, {"detail": state.get(
                "block_detail", "blocked by policy: no passing scan for hello-app:latest in dev")})
        row = {
            "id": len(state["promotions"]) + 1,
            "image_name": body.get("image_name"), "tag": body.get("tag"),
            "from_registry": body.get("from_registry", "dev"),
            "to_registry": body.get("to_registry", "prod"),
            "promoted_by": body.get("promoted_by"), "status": "success",
            "digest": "sha256:" + "cd" * 32, "detail": "",
            "created_at": "2026-06-12T00:00:00Z", "action": "promote",
        }
        state["promotions"].insert(0, row)
        return _json(201, row)
    if path == "/rollback" and method == "POST":
        if state.get("no_rollback_target"):
            return _json(404, {"detail": "No previous successful promotion of {}:{} to {} "
                                         "to roll back to".format(body.get("image_name"),
                                                                  body.get("tag"),
                                                                  body.get("environment"))})
        row = {
            "id": len(state["promotions"]) + 1,
            "image_name": body.get("image_name"), "tag": body.get("tag"),
            "from_registry": "", "to_registry": body.get("environment"),
            "promoted_by": body.get("rolled_back_by"), "status": "success",
            "digest": "sha256:" + "ef" * 32, "detail": "rollback",
            "created_at": "2026-06-12T00:00:00Z", "action": "rollback",
        }
        state["promotions"].insert(0, row)
        return _json(201, row)
    if path == "/promotions" and method == "GET":
        return _json(200, state["promotions"])
    if path == "/scans" and method == "POST":
        passed = int(body.get("critical", 0)) <= 0  # server-side gate
        row = {key: body.get(key) for key in
               ("image_name", "tag", "registry", "scanned_by",
                "critical", "high", "medium", "low", "total")}
        row.update({"id": len(state["scans"]) + 1, "passed": passed,
                    "report": body.get("report", ""),
                    "created_at": "2026-06-12T00:00:00Z"})
        state["scans"].insert(0, row)
        return _json(201, row)
    if path == "/scans" and method == "GET":
        items = state["scans"]
        wanted = record["query"].get("image_name", [None])[0]
        if wanted:
            items = [s for s in items if s["image_name"] == wanted]
        summaries = [{k: v for k, v in s.items() if k != "report"} for s in items]
        return _json(200, summaries)
    if path.startswith("/scans/") and method == "GET":
        sid = int(path.rsplit("/", 1)[1])
        for s in state["scans"]:
            if s["id"] == sid:
                return _json(200, s)
        return _json(404, {"detail": "Scan not found"})
    return _json(404, {"detail": "not found"})


# ── gitea router ─────────────────────────────────────────────────────────────

REPO_PREFIX = "/api/v1/repos/mcpadmin/sample-app"


def gitea_router(method, record, state):
    path = record["path"]
    if path == "/api/healthz":
        return _json(200, {"status": "pass"})
    if path == "/api/v1/repos/search":
        return _json(200, {"ok": True, "data": state.get("repos", [
            {"name": "sample-app", "full_name": "mcpadmin/sample-app",
             "description": "Sample application for MCP lab"}])})
    if path.startswith(REPO_PREFIX + "/contents/"):
        filepath = path[len(REPO_PREFIX + "/contents/"):]
        files = state.setdefault("files", {})
        if method == "GET":
            if filepath in files:
                entry = files[filepath]
                return _json(200, {
                    "name": filepath.split("/")[-1], "path": filepath,
                    "sha": entry["sha"], "encoding": "base64",
                    "content": base64.b64encode(entry["content"].encode()).decode()})
            return _json(404, {"message": "not found"})
        body = json.loads(record["body"])
        content = base64.b64decode(body["content"]).decode()
        if method == "POST":
            if filepath in files:
                return _json(422, {"message": "file already exists"})
            state["sha_counter"] = state.get("sha_counter", 0) + 1
            files[filepath] = {"sha": "sha-{}".format(state["sha_counter"]), "content": content}
            return _json(201, {"content": {"path": filepath, "sha": files[filepath]["sha"]}})
        if method == "PUT":
            if filepath not in files:
                return _json(404, {"message": "not found"})
            if body.get("sha") != files[filepath]["sha"]:
                return _json(409, {"message": "sha mismatch"})
            state["sha_counter"] = state.get("sha_counter", 0) + 1
            files[filepath] = {"sha": "sha-{}".format(state["sha_counter"]), "content": content}
            return _json(200, {"content": {"path": filepath, "sha": files[filepath]["sha"]}})
    if path == REPO_PREFIX + "/actions/tasks":
        sequence = state.get("runs_sequence")
        if sequence:
            runs = sequence.pop(0) if len(sequence) > 1 else sequence[0]
        else:
            runs = state.get("runs", [])
        return _json(200, {"workflow_runs": runs, "total_count": len(runs)})
    if path == REPO_PREFIX + "/commits":
        return _json(200, state.get("commits", []))
    return _json(404, {"message": "not found"})


# ── fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture
def fake_registries():
    regs = {name: FakeService(registry_router, {"tags": {}, "manifests": {}})
            for name in ("dev", "staging", "prod")}
    yield regs
    for service in regs.values():
        service.stop()


@pytest.fixture
def fake_promotion():
    service = FakeService(promotion_router, {
        "policy": {"flow": "three-stage", "require_scan": True, "max_critical": 0,
                   "legal_promotions": [["dev", "staging"], ["staging", "prod"]]},
        "promotions": [], "scans": [],
    })
    yield service
    service.stop()


@pytest.fixture
def fake_gitea():
    service = FakeService(gitea_router, {"files": {}, "runs": [], "commits": []})
    yield service
    service.stop()


@pytest.fixture
def lab_env(monkeypatch, tmp_path, fake_registries, fake_promotion, fake_gitea):
    """Point labctl's endpoints at the fakes; repo root at a tmp dir (no .env)."""
    monkeypatch.setenv("LABCTL_REPO_ROOT", str(tmp_path))
    monkeypatch.setenv("LABCTL_GITEA_URL", fake_gitea.url)
    monkeypatch.setenv("LABCTL_PROMOTION_URL", fake_promotion.url)
    monkeypatch.setenv("LABCTL_REGISTRY_DEV_URL", fake_registries["dev"].url)
    monkeypatch.setenv("LABCTL_REGISTRY_STAGING_URL", fake_registries["staging"].url)
    monkeypatch.setenv("LABCTL_REGISTRY_PROD_URL", fake_registries["prod"].url)
    # Closed ports → deterministic "down" for services we don't fake:
    monkeypatch.setenv("LABCTL_USER_API_URL", "http://127.0.0.1:1")
    monkeypatch.setenv("LABCTL_CHAT_UI_URL", "http://127.0.0.1:1")
    monkeypatch.setenv("LABCTL_TRIVY_URL", "http://127.0.0.1:1")
    monkeypatch.delenv("NO_COLOR", raising=False)
    return SimpleNamespace(registries=fake_registries, promotion=fake_promotion,
                           gitea=fake_gitea, root=tmp_path)


@pytest.fixture
def fake_proc(monkeypatch):
    """Replace the single subprocess choke point; record exact argv."""
    calls = []
    handlers = []

    def _execute(argv, capture=True, stream=False):
        calls.append({"argv": list(argv), "capture": capture, "stream": stream})
        for matcher, handler in handlers:
            if matcher(argv):
                return handler(argv)
        return subprocess.CompletedProcess(argv, 0, stdout="", stderr="")

    monkeypatch.setattr(proc, "_execute", _execute)
    fake = SimpleNamespace(calls=calls)
    fake.argvs = lambda: [c["argv"] for c in calls]
    fake.add = lambda matcher, handler: handlers.append((matcher, handler))
    return fake


def seed_dev_image(lab_env, name="hello-app", tags=("latest", "v1.0.0"),
                   ctype="application/vnd.oci.image.manifest.v1+json",
                   manifest=b'{"schemaVersion":2,"mediaType":"application/vnd.oci.image.manifest.v1+json"}'):
    dev = lab_env.registries["dev"]
    dev.state["tags"][name] = list(tags)
    for tag in tags:
        dev.state["manifests"][(name, tag)] = (ctype, manifest)
    return dev
