"""Contract §3 — scan_image becomes a REAL Trivy scan: runs the trivy client
as a sibling container via engine_cmd, parses severity counts from the JSON,
POSTs the record to the promotion service, returns a human summary.

Everything is mocked: subprocess (the engine/trivy invocation) and httpx
(the promotion-service POST). No containers needed.
"""

import asyncio
import json

import httpx
import pytest
from mcp.server.fastmcp import FastMCP

from mcp_server import config, engine
from tests.helpers import HTTPRecorder, registered_tools


# Trivy JSON fixture with KNOWN severity counts:
#   critical=1, high=2, medium=1, low=3 (+1 UNKNOWN) → total=8
# One result has no "Vulnerabilities" key at all (clean target) — the parser
# must not blow up on it.
TRIVY_REPORT = {
    "SchemaVersion": 2,
    "ArtifactName": "registry-dev:5000/hello-app:latest",
    "Results": [
        {
            "Target": "registry-dev:5000/hello-app:latest (debian 12)",
            "Vulnerabilities": [
                {"VulnerabilityID": "CVE-1", "Severity": "CRITICAL"},
                {"VulnerabilityID": "CVE-2", "Severity": "HIGH"},
                {"VulnerabilityID": "CVE-3", "Severity": "HIGH"},
                {"VulnerabilityID": "CVE-4", "Severity": "MEDIUM"},
            ],
        },
        {
            "Target": "usr/local/bin/app",
            # no Vulnerabilities key — Trivy omits it for clean targets
        },
        {
            "Target": "Python",
            "Vulnerabilities": [
                {"VulnerabilityID": "CVE-5", "Severity": "LOW"},
                {"VulnerabilityID": "CVE-6", "Severity": "LOW"},
                {"VulnerabilityID": "CVE-7", "Severity": "LOW"},
                {"VulnerabilityID": "CVE-8", "Severity": "UNKNOWN"},
            ],
        },
    ],
}


class FakeProc:
    def __init__(self, returncode, stdout=b"", stderr=b""):
        self.returncode = returncode
        self._stdout = stdout
        self._stderr = stderr

    async def communicate(self):
        return self._stdout, self._stderr


class FakeCtx:
    """Stands in for the FastMCP Context — records every info() message."""

    def __init__(self):
        self.messages: list[str] = []

    async def info(self, message: str):
        self.messages.append(message)


@pytest.fixture
def force_docker_engine(monkeypatch):
    """Pin engine detection to docker so command argv is deterministic."""
    monkeypatch.setenv("CONTAINER_ENGINE_FORCE", "docker")
    monkeypatch.setattr(engine, "_DETECTED_ENGINE", None)
    yield
    monkeypatch.setattr(engine, "_DETECTED_ENGINE", None)


@pytest.fixture
def lab_config(monkeypatch):
    monkeypatch.setattr(config, "DEV_REGISTRY_HOST", "registry-dev:5000")
    monkeypatch.setattr(config, "STAGING_REGISTRY_HOST", "registry-staging:5000")
    monkeypatch.setattr(config, "PROD_REGISTRY_HOST", "registry-prod:5000")
    monkeypatch.setattr(config, "TRIVY_SERVER_URL", "http://trivy:8080")
    monkeypatch.setattr(config, "PROMOTION_SERVICE_URL", "http://promotion-service:8002")


@pytest.fixture
def fake_httpx(monkeypatch):
    rec = HTTPRecorder()
    monkeypatch.setattr(httpx, "AsyncClient", rec.client_class())
    return rec


@pytest.fixture
def scan_tool():
    from mcp_server.tools import runner_tools
    mcp = FastMCP("test-scan")
    runner_tools.register(mcp)
    return registered_tools(mcp)["scan_image"]


def _capture_subprocess(monkeypatch, returncode=0, stdout=b"", stderr=b""):
    captured: list[tuple] = []

    async def fake_exec(*args, **kwargs):
        captured.append(args)
        return FakeProc(returncode, stdout=stdout, stderr=stderr)

    monkeypatch.setattr(asyncio, "create_subprocess_exec", fake_exec)
    return captured


async def test_scan_image_happy_path(monkeypatch, force_docker_engine, lab_config,
                                     fake_httpx, scan_tool):
    captured = _capture_subprocess(
        monkeypatch, returncode=0, stdout=json.dumps(TRIVY_REPORT).encode()
    )
    fake_httpx.queue(
        {"id": 42, "image_name": "hello-app", "tag": "latest", "registry": "dev",
         "scanned_by": "mcp-runner", "critical": 1, "high": 2, "medium": 1,
         "low": 3, "total": 8, "passed": False, "created_at": "2026-06-11T00:00:00Z"},
        status_code=201,
    )

    out = await scan_tool()  # all defaults: hello-app:latest in dev

    # ── trivy command construction ──
    assert len(captured) == 1
    argv = captured[0]
    assert argv[0] == "docker"
    assert argv[1:5] == ("run", "--rm", "--network", "mcp-lab-net")
    assert "aquasec/trivy:latest" in argv
    assert "image" in argv
    assert "--insecure" in argv
    server_idx = argv.index("--server")
    assert argv[server_idx + 1] == "http://trivy:8080"
    assert argv[-1] == "registry-dev:5000/hello-app:latest"

    # ── POST payload to the promotion service ──
    post = fake_httpx.calls[0]
    assert post["method"] == "POST"
    assert post["url"] == "http://promotion-service:8002/scans"
    payload = post["json"]
    assert payload["image_name"] == "hello-app"
    assert payload["tag"] == "latest"
    assert payload["registry"] == "dev"
    assert payload["scanned_by"] == "mcp-runner"
    assert payload["critical"] == 1
    assert payload["high"] == 2
    assert payload["medium"] == 1
    assert payload["low"] == 3
    assert payload["total"] == 8
    assert json.loads(payload["report"]) == TRIVY_REPORT

    # ── human summary ──
    assert "1 critical" in out
    assert "2 high" in out
    assert "1 medium" in out
    assert "3 low" in out
    assert "8 findings" in out
    assert "FAILED" in out  # passed=False from the service (critical > 0)
    assert "42" in out


async def test_scan_image_staging_registry_routing(monkeypatch, force_docker_engine,
                                                   lab_config, fake_httpx, scan_tool):
    captured = _capture_subprocess(
        monkeypatch, returncode=0, stdout=json.dumps({"Results": []}).encode()
    )
    fake_httpx.queue({"id": 7, "passed": True}, status_code=201)

    out = await scan_tool(image_name="hello-app", tag="v1.0.0", registry="staging")

    assert captured[0][-1] == "registry-staging:5000/hello-app:v1.0.0"
    assert fake_httpx.calls[0]["json"]["registry"] == "staging"
    assert fake_httpx.calls[0]["json"]["total"] == 0
    assert "PASSED" in out


async def test_scan_image_invalid_registry(scan_tool):
    out = await scan_tool(registry="qa")
    assert "Invalid registry" in out
    assert "dev, staging, prod" in out


async def test_scan_image_unreachable_trivy_is_actionable(monkeypatch, force_docker_engine,
                                                          lab_config, fake_httpx, scan_tool):
    _capture_subprocess(
        monkeypatch, returncode=1,
        stderr=b'FATAL image scan error: unable to connect to "trivy:8080": connection refused',
    )
    out = await scan_tool()
    assert "docker compose --profile security up -d trivy" in out
    assert "Traceback" not in out
    # the scan must NOT be recorded when trivy failed
    assert fake_httpx.calls == []


async def test_scan_image_no_results_is_indeterminate_not_pass(
        monkeypatch, force_docker_engine, lab_config, fake_httpx, scan_tool):
    """A Trivy report with no `Results` key (an image it can't analyze) must NOT
    be recorded as a passing scan — otherwise an unassessed image could satisfy
    the promotion scan gate."""
    no_results = {
        "SchemaVersion": 2, "ArtifactName": "registry-dev:5000/hello-app:latest",
        "ArtifactType": "container_image",
        # note: no "Results" key at all
    }
    _capture_subprocess(monkeypatch, returncode=0, stdout=json.dumps(no_results).encode())

    out = await scan_tool()
    assert "INDETERMINATE" in out
    assert "PASSED" not in out
    # nothing recorded → the gate keeps blocking
    assert fake_httpx.calls == []


async def test_scan_image_promotion_service_down_still_summarizes(
        monkeypatch, force_docker_engine, lab_config, fake_httpx, scan_tool):
    """If recording the scan fails, the tool still returns the counts plus a
    warning — never a stack trace."""
    _capture_subprocess(
        monkeypatch, returncode=0, stdout=json.dumps(TRIVY_REPORT).encode()
    )
    fake_httpx.queue({"detail": "boom"}, status_code=500)

    out = await scan_tool()
    assert "1 critical" in out
    assert "WARNING" in out
    assert "promotion service" in out
    assert "Traceback" not in out


async def test_scan_image_logs_contain_no_credentials(monkeypatch, force_docker_engine,
                                                      lab_config, fake_httpx, scan_tool):
    """D-007: nothing secret may reach ctx.info logging or the command line."""
    secret = "super-secret-token-xyz"
    monkeypatch.setattr(config, "GITEA_TOKEN", secret)

    captured = _capture_subprocess(
        monkeypatch, returncode=0, stdout=json.dumps({"Results": []}).encode()
    )
    fake_httpx.queue({"id": 1, "passed": True}, status_code=201)

    ctx = FakeCtx()
    out = await scan_tool(ctx=ctx)

    assert ctx.messages, "expected the trivy command to be logged via ctx.info"
    for message in ctx.messages:
        assert secret not in message
    for argv in captured:
        assert secret not in " ".join(argv)
    assert secret not in out
