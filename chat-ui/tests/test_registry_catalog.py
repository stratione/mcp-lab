"""GET /api/registries/catalog — backs the always-on RegistryCatalog card
in the MCP servers panel. Mocks the two backing registries with respx so
the test runs offline.

Also covers POST /api/registries/{name}/clear (the Clear button affordance)
with subprocess mocked.
"""

import subprocess
from types import SimpleNamespace

import pytest
import respx
import httpx

from app import main


@pytest.mark.asyncio
@respx.mock
async def test_catalog_aggregates_dev_and_prod(client):
    respx.get(f"{main._DEV_REGISTRY_URL}/v2/_catalog").mock(
        return_value=httpx.Response(200, json={"repositories": ["hello-app"]})
    )
    respx.get(f"{main._DEV_REGISTRY_URL}/v2/hello-app/tags/list").mock(
        return_value=httpx.Response(200, json={"name": "hello-app", "tags": ["latest", "v1.0.0"]})
    )
    respx.get(f"{main._PROD_REGISTRY_URL}/v2/_catalog").mock(
        return_value=httpx.Response(200, json={"repositories": []})
    )

    r = await client.get("/api/registries/catalog")
    assert r.status_code == 200
    body = r.json()
    assert [reg["name"] for reg in body["registries"]] == ["dev", "prod"]
    dev = body["registries"][0]
    assert dev["status"] == "online"
    assert dev["images"] == [{"name": "hello-app", "tags": ["latest", "v1.0.0"]}]
    prod = body["registries"][1]
    assert prod["status"] == "online"
    assert prod["images"] == []


@pytest.mark.asyncio
@respx.mock
async def test_catalog_marks_unreachable_registry_offline(client):
    """If a registry isn't running, the endpoint must still return 200 so
    the UI can render an offline state instead of failing silently."""
    respx.get(f"{main._DEV_REGISTRY_URL}/v2/_catalog").mock(
        side_effect=httpx.ConnectError("connection refused")
    )
    respx.get(f"{main._PROD_REGISTRY_URL}/v2/_catalog").mock(
        return_value=httpx.Response(200, json={"repositories": []})
    )

    r = await client.get("/api/registries/catalog")
    assert r.status_code == 200
    body = r.json()
    dev, prod = body["registries"]
    assert dev["status"] == "offline"
    assert "error" in dev
    assert prod["status"] == "online"


@pytest.mark.asyncio
@respx.mock
async def test_catalog_tolerates_missing_tags_endpoint(client):
    """A registry that lists a repo but errors on /tags/list (newly-pushed
    image with no manifest yet, etc.) should appear with an empty tag list,
    not crash the response."""
    respx.get(f"{main._DEV_REGISTRY_URL}/v2/_catalog").mock(
        return_value=httpx.Response(200, json={"repositories": ["broken-app"]})
    )
    respx.get(f"{main._DEV_REGISTRY_URL}/v2/broken-app/tags/list").mock(
        return_value=httpx.Response(500, json={})
    )
    respx.get(f"{main._PROD_REGISTRY_URL}/v2/_catalog").mock(
        return_value=httpx.Response(200, json={"repositories": []})
    )

    r = await client.get("/api/registries/catalog")
    assert r.status_code == 200
    dev = r.json()["registries"][0]
    assert dev["status"] == "online"
    assert dev["images"] == [{"name": "broken-app", "tags": []}]


# ─── /api/registries/{name}/clear ──────────────────────────────────────


@pytest.fixture
def fake_compose_file(monkeypatch):
    """The clear endpoint pre-flights `_compose_file_args()` to make sure the
    chat-ui container has the compose file mounted. Tests run on the host
    where /app/docker-compose.yml doesn't exist, so we stub the lookup to
    return a non-empty list (matching the production "found" path)."""
    monkeypatch.setattr(main, "_compose_file_args", lambda: ["-f", "/test/compose.yml"])


@pytest.mark.asyncio
async def test_clear_runs_stop_rmvolume_start_in_order(client, monkeypatch, fake_compose_file):
    """Happy path: stop registry-dev, drop its volume, start it again. The
    endpoint must run all three steps and return ok."""
    calls = []

    def fake_run(cmd, **kwargs):
        calls.append(cmd)
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    monkeypatch.setattr(subprocess, "run", fake_run)
    r = await client.post("/api/registries/dev/clear")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["registry"] == "dev"
    assert body["volume"] == "mcp-lab_registry-dev-data"
    # Three subprocess calls in order: stop, volume rm, up.
    assert len(calls) == 3
    assert "stop" in calls[0] and "registry-dev" in calls[0]
    assert calls[1][:3] == ["docker", "volume", "rm"]
    assert calls[1][-1] == "mcp-lab_registry-dev-data"
    assert "up" in calls[2] and "registry-dev" in calls[2]


@pytest.mark.asyncio
async def test_clear_rejects_unknown_registry(client, monkeypatch):
    monkeypatch.setattr(subprocess, "run", lambda *a, **kw: SimpleNamespace(returncode=0, stdout="", stderr=""))
    r = await client.post("/api/registries/staging/clear")
    assert r.status_code == 400
    assert "Unknown registry" in r.json()["detail"]


@pytest.mark.asyncio
async def test_clear_tolerates_missing_volume(client, monkeypatch, fake_compose_file):
    """If the volume doesn't exist (fresh lab, first clear ever), `docker
    volume rm` returns 'No such volume'. The endpoint must treat that as a
    no-op success and still proceed to the up step."""
    seq = iter([
        SimpleNamespace(returncode=0, stdout="", stderr=""),       # stop
        SimpleNamespace(returncode=1, stdout="", stderr="Error: No such volume: mcp-lab_registry-prod-data"),  # rm
        SimpleNamespace(returncode=0, stdout="", stderr=""),       # up
    ])
    monkeypatch.setattr(subprocess, "run", lambda *a, **kw: next(seq))
    r = await client.post("/api/registries/prod/clear")
    assert r.status_code == 200, r.text
    assert r.json()["ok"] is True


@pytest.mark.asyncio
async def test_clear_returns_503_when_compose_file_missing(client, monkeypatch):
    """If /app/docker-compose.yml isn't mounted (stale chat-ui container), the
    endpoint must short-circuit with a 503 + actionable rebuild instruction
    instead of letting `compose up` fail with a confusing error."""
    monkeypatch.setattr(main, "_compose_file_args", lambda: [])
    monkeypatch.setattr(subprocess, "run", lambda *a, **kw: SimpleNamespace(returncode=0, stdout="", stderr=""))
    r = await client.post("/api/registries/dev/clear")
    assert r.status_code == 503
    assert "rebuild" in r.json()["detail"].lower()


@pytest.mark.asyncio
async def test_clear_propagates_real_failure(client, monkeypatch, fake_compose_file):
    """If `up` actually fails (image broken, etc.), the endpoint must
    return 500 with the stderr so the UI can surface the real error."""
    seq = iter([
        SimpleNamespace(returncode=0, stdout="", stderr=""),
        SimpleNamespace(returncode=0, stdout="", stderr=""),
        SimpleNamespace(returncode=1, stdout="", stderr="image not found: registry:2"),
    ])
    monkeypatch.setattr(subprocess, "run", lambda *a, **kw: next(seq))
    r = await client.post("/api/registries/dev/clear")
    assert r.status_code == 500
    assert "image not found" in r.json()["detail"]
