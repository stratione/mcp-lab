"""Learn Mode backend: /api/curriculum/progress + /api/curriculum/check.

Progress is a {done: {"<module>.<step>": true}} blob in the chat-ui volume.
The check endpoint runs the vendored labctl_pkg module checks; in tests we
put labctl-cli/ on sys.path to simulate the image's COPY of labctl_pkg.
"""

import sys
from pathlib import Path

import pytest

# Simulate the Dockerfile's vendoring (COPY labctl-cli/labctl_pkg ./labctl_pkg).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "labctl-cli"))

from app import main  # noqa: E402


@pytest.fixture
def progress_file(tmp_path, monkeypatch):
    f = tmp_path / "curriculum_progress.json"
    monkeypatch.setattr(main, "CHAT_DATA_DIR", tmp_path)
    monkeypatch.setattr(main, "CURRICULUM_PROGRESS_FILE", f)
    return f


@pytest.mark.asyncio
async def test_progress_empty_by_default(client, progress_file):
    r = await client.get("/api/curriculum/progress")
    assert r.status_code == 200
    assert r.json() == {"done": {}}


@pytest.mark.asyncio
async def test_progress_roundtrip_and_falsy_filtering(client, progress_file):
    r = await client.post(
        "/api/curriculum/progress",
        json={"done": {"1.concept": True, "1.hand-clone": True, "2.concept": False}},
    )
    assert r.status_code == 200
    r = await client.get("/api/curriculum/progress")
    # False entries are dropped, not stored.
    assert r.json() == {"done": {"1.concept": True, "1.hand-clone": True}}


@pytest.mark.asyncio
async def test_progress_rejects_wrong_shape(client, progress_file):
    r = await client.post("/api/curriculum/progress", json={"done": "yes"})
    assert r.status_code == 422
    r = await client.post("/api/curriculum/progress", json=["nope"])
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_check_unknown_module_is_400(client):
    r = await client.post("/api/curriculum/check/99")
    assert r.status_code == 400
    assert "unknown module" in r.json()["detail"]


@pytest.mark.asyncio
async def test_check_8_reports_mcp_user_down(client, monkeypatch, tmp_path):
    # Closed port → check_byo's ServiceDown branch: a clean FAIL with the
    # compose hint, not a 5xx.
    monkeypatch.setenv("LABCTL_REPO_ROOT", str(tmp_path))
    monkeypatch.setenv("LABCTL_MCP_USER_URL", "http://127.0.0.1:1")
    r = await client.post("/api/curriculum/check/8")
    assert r.status_code == 200
    body = r.json()
    assert body["passed"] is False
    assert "not answering" in body["detail"]
    assert "mcp-user" in body["hint"]
