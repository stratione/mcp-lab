"""Backend coverage for the deferred-build flow.

After `make small`, only the tier's MCP images are built synchronously;
the rest are kicked off in the background. The chat-ui has to:

  1. Surface "preparing" / "ready" per service in /api/mcp-status so the
     dashboard can label Start buttons correctly.
  2. Refuse a Start click on a not-yet-built image with a friendly 503
     instead of letting compose blow up with "no such image".

Both behaviors hinge on a single `_image_exists()` helper that shells out
to `docker image inspect`. We patch it here to avoid needing a real
docker daemon during the test run.
"""

import pytest
from app import main


@pytest.fixture
def fake_check_servers(monkeypatch):
    """Stub check_servers so /api/mcp-status doesn't try to hit real MCPs."""
    async def _fake():
        return [
            {"name": "user", "url": "http://x", "port": 8003,
             "status": "offline", "tools": [], "tool_count": 0},
            {"name": "gitea", "url": "http://y", "port": 8004,
             "status": "offline", "tools": [], "tool_count": 0},
        ]
    monkeypatch.setattr(main, "check_servers", _fake)


@pytest.mark.asyncio
async def test_mcp_status_includes_prebuild_status(client, monkeypatch, fake_check_servers):
    """Each configured MCP service must appear in prebuild_status with either
    'ready' or 'preparing'. Without this the UI can't differentiate a "click
    Start now" image from a "still building in the background" one."""
    # mcp-user is built; mcp-gitea is not yet.
    def fake_exists(service: str) -> bool:
        return service == "mcp-user"
    monkeypatch.setattr(main, "_image_exists", fake_exists)

    r = await client.get("/api/mcp-status")
    body = r.json()
    assert r.status_code == 200
    assert body["prebuild_status"]["mcp-user"] == "ready"
    assert body["prebuild_status"]["mcp-gitea"] == "preparing"


@pytest.mark.asyncio
async def test_mcp_control_start_returns_503_when_image_not_built(client, monkeypatch):
    """Clicking Start before the background build finishes must NOT call
    compose (which would error opaquely with 'no such image'). The endpoint
    pre-flights `_image_exists` and returns 503 with a hint instead."""
    monkeypatch.setattr(main, "_image_exists", lambda s: False)
    # Make sure compose is never invoked — if pre-flight fails to short-circuit,
    # the test fails loudly here rather than silently calling docker.
    def boom(*args, **kwargs):
        raise AssertionError("compose was invoked despite missing image")
    monkeypatch.setattr(main.subprocess, "run", boom)

    r = await client.post("/api/mcp-control", json={"service": "mcp-gitea", "action": "start"})
    assert r.status_code == 503
    body = r.json()
    assert "preparing" in body["detail"].lower()


@pytest.mark.asyncio
async def test_mcp_control_stop_works_even_when_image_missing(client, monkeypatch):
    """Stop must NOT pre-flight on the image — you don't need an image to
    stop a running container, and we shouldn't punish the user for a
    container that's already up."""
    monkeypatch.setattr(main, "_image_exists", lambda s: False)
    captured: list = []
    class FakeRun:
        def __init__(self, returncode=0, stderr="", stdout=""):
            self.returncode = returncode
            self.stderr = stderr
            self.stdout = stdout
    def fake_run(args, **kwargs):
        captured.append(args)
        return FakeRun()
    monkeypatch.setattr(main.subprocess, "run", fake_run)

    r = await client.post("/api/mcp-control", json={"service": "mcp-gitea", "action": "stop"})
    assert r.status_code == 200, f"stop should not be blocked by image check; got {r.status_code} {r.text}"
    assert captured, "compose must be invoked for a stop request"
    # Confirm it really was a stop, not an up.
    assert "stop" in captured[0]


@pytest.mark.asyncio
async def test_mcp_control_start_calls_compose_when_image_ready(client, monkeypatch):
    """The happy path: image exists, Start invokes compose normally."""
    monkeypatch.setattr(main, "_image_exists", lambda s: True)
    captured: list = []
    class FakeRun:
        returncode = 0
        stderr = ""
        stdout = ""
    def fake_run(args, **kwargs):
        captured.append(args)
        return FakeRun()
    monkeypatch.setattr(main.subprocess, "run", fake_run)

    r = await client.post("/api/mcp-control", json={"service": "mcp-user", "action": "start"})
    assert r.status_code == 200
    assert captured, "compose must be invoked when image is ready"
    assert "up" in captured[0] and "--no-build" in captured[0]
