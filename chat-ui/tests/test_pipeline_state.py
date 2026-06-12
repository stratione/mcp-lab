"""GET /api/pipeline/state (contract §4): the Pipeline Board's aggregated
snapshot. The non-negotiable property is graceful degradation — every
section flips to {"status": "offline"} independently and the endpoint
itself never 500s, even with the whole lab down.

Downstreams (Gitea, registries, promotion-service, docker socket) are
mocked with respx; respx patches httpx's transports so even the
UDS-bound docker-socket client is intercepted.

Also pins the /api/probe allowlist additions (5003 registry-staging,
8087 trivy).
"""

import httpx
import pytest
import respx

from app import main, pipeline
from app.events import EventStore


@pytest.fixture
def wired_store(tmp_path, monkeypatch):
    s = EventStore(tmp_path / "events.json")
    monkeypatch.setattr(main, "_event_store", s)
    return s


def _mock_everything_else_offline():
    """Catch-all route — must be added LAST (respx matches in order)."""
    respx.route(url__regex=r".*").mock(side_effect=httpx.ConnectError("connection refused"))


SECTIONS = ["commit", "ci", "scans", "promotions", "deployments", "events"]


# ─── Full-degradation path ──────────────────────────────────────────────


@pytest.mark.asyncio
@respx.mock
async def test_all_downstreams_offline_every_section_degrades(client, wired_store, monkeypatch):
    _mock_everything_else_offline()

    # Even the local event store failing must not 500 the snapshot.
    async def broken_list(limit=50):
        raise RuntimeError("store exploded")
    monkeypatch.setattr(wired_store, "list", broken_list)

    r = await client.get("/api/pipeline/state")
    assert r.status_code == 200
    body = r.json()
    assert body["generated_at"]
    for section in SECTIONS:
        assert body[section]["status"] == "offline", f"{section}: {body[section]}"
    for reg in ("dev", "staging", "prod"):
        assert body["registries"][reg]["status"] == "offline"


# ─── Per-section passthrough when one downstream IS up ──────────────────


@pytest.mark.asyncio
@respx.mock
async def test_commit_section_maps_gitea_commit(client, wired_store):
    respx.get(f"{pipeline.GITEA_URL}/api/v1/repos/{pipeline.SAMPLE_REPO}/commits").mock(
        return_value=httpx.Response(200, json=[{
            "sha": "deadbeefcafe",
            "created": "2026-06-12T10:00:00Z",
            "commit": {
                "message": "feat: add /healthz\n\nbody text",
                "author": {"name": "mcpadmin", "date": "2026-06-12T10:00:00Z"},
            },
        }])
    )
    _mock_everything_else_offline()

    body = (await client.get("/api/pipeline/state")).json()
    assert body["commit"] == {
        "status": "ok",
        "repo": "mcpadmin/sample-app",
        "sha": "deadbeefcafe",
        "message": "feat: add /healthz",
        "author": "mcpadmin",
        "when": "2026-06-12T10:00:00Z",
    }
    # Independence: a live Gitea doesn't resurrect anything else.
    assert body["scans"]["status"] == "offline"


@pytest.mark.asyncio
@respx.mock
async def test_ci_section_maps_action_runs(client, wired_store):
    respx.get(f"{pipeline.GITEA_URL}/api/v1/repos/{pipeline.SAMPLE_REPO}/actions/tasks").mock(
        return_value=httpx.Response(200, json={
            "total_count": 1,
            "workflow_runs": [{
                "id": 42, "display_title": "fix: handle empty tags",
                "status": "success", "event": "push",
                "head_sha": "deadbeefcafe", "created_at": "2026-06-12T10:01:00Z",
            }],
        })
    )
    _mock_everything_else_offline()

    ci = (await client.get("/api/pipeline/state")).json()["ci"]
    assert ci["status"] == "ok"
    assert ci["runs"] == [{
        "id": 42, "title": "fix: handle empty tags", "status": "success",
        "event": "push", "head_sha": "deadbeefcafe", "created": "2026-06-12T10:01:00Z",
    }]


@pytest.mark.asyncio
@respx.mock
async def test_ci_404_reports_offline_with_hint(client, wired_store):
    """Old Gitea / actions disabled → the tasks endpoint 404s. That must
    surface as offline + an actionable hint, not a raw error."""
    respx.get(f"{pipeline.GITEA_URL}/api/v1/repos/{pipeline.SAMPLE_REPO}/actions/tasks").mock(
        return_value=httpx.Response(404, json={"message": "not found"})
    )
    _mock_everything_else_offline()

    ci = (await client.get("/api/pipeline/state")).json()["ci"]
    assert ci["status"] == "offline"
    assert "actions" in ci.get("hint", "").lower()


@pytest.mark.asyncio
@respx.mock
async def test_registry_section_lists_images_and_caps_at_ten(client, wired_store):
    staging = pipeline.REGISTRY_URLS["staging"]
    repos = [f"app-{i}" for i in range(12)]  # 12 repos → capped to 10
    respx.get(f"{staging}/v2/_catalog").mock(
        return_value=httpx.Response(200, json={"repositories": repos})
    )
    respx.get(url__regex=rf"{staging}/v2/app-\d+/tags/list$").mock(
        return_value=httpx.Response(200, json={"tags": ["latest", "v1.0.0"]})
    )
    _mock_everything_else_offline()

    regs = (await client.get("/api/pipeline/state")).json()["registries"]
    assert regs["staging"]["status"] == "ok"
    images = regs["staging"]["images"]
    assert len(images) == 10
    assert images[0] == {"name": "app-0", "tags": ["latest", "v1.0.0"]}
    assert regs["dev"]["status"] == "offline"
    assert regs["prod"]["status"] == "offline"


@pytest.mark.asyncio
@respx.mock
async def test_scans_section_is_passthrough(client, wired_store):
    scan = {
        "id": 1, "image_name": "hello-app", "tag": "latest", "registry": "dev",
        "scanned_by": "labctl", "critical": 0, "high": 2, "medium": 5, "low": 9,
        "total": 16, "passed": True, "created_at": "2026-06-12T10:02:00Z",
    }
    respx.get(f"{pipeline.PROMOTION_SERVICE_URL}/scans").mock(
        return_value=httpx.Response(200, json=[scan])
    )
    _mock_everything_else_offline()

    scans = (await client.get("/api/pipeline/state")).json()["scans"]
    assert scans == {"status": "ok", "items": [scan]}


@pytest.mark.asyncio
@respx.mock
async def test_promotions_section_passthrough_capped_at_20(client, wired_store):
    promo = {
        "id": 1, "image_name": "hello-app", "tag": "latest",
        "from_registry": "dev", "to_registry": "staging", "promoted_by": "mcpadmin",
        "status": "success", "digest": "sha256:abc", "detail": None,
        "action": "promote", "created_at": "2026-06-12T10:03:00Z",
    }
    items = [dict(promo, id=i) for i in range(25, 0, -1)]  # 25 rows, newest first
    respx.get(f"{pipeline.PROMOTION_SERVICE_URL}/promotions").mock(
        return_value=httpx.Response(200, json=items)
    )
    _mock_everything_else_offline()

    promotions = (await client.get("/api/pipeline/state")).json()["promotions"]
    assert promotions["status"] == "ok"
    assert len(promotions["items"]) == 20
    assert promotions["items"][0] == items[0]  # newest kept


@pytest.mark.asyncio
@respx.mock
async def test_deployments_section_maps_docker_containers(client, wired_store):
    respx.get("http://docker/containers/json").mock(
        return_value=httpx.Response(200, json=[{
            "Names": ["/mcp-lab-app-dev"],
            "Image": "localhost:5001/hello-app:latest",
            "State": "running",
            "Labels": {"mcp-lab.deployed": "true", "mcp-lab.env": "dev"},
            "Ports": [{"PrivatePort": 8080, "PublicPort": 9080, "Type": "tcp"}],
        }])
    )
    _mock_everything_else_offline()

    deployments = (await client.get("/api/pipeline/state")).json()["deployments"]
    assert deployments == {"status": "ok", "items": [{
        "name": "mcp-lab-app-dev",
        "image": "localhost:5001/hello-app:latest",
        "env": "dev",
        "port": 9080,
        "state": "running",
    }]}


@pytest.mark.asyncio
@respx.mock
async def test_events_section_serves_latest_from_store(client, wired_store):
    _mock_everything_else_offline()
    for i in range(3):
        await wired_store.append("manual", "note", f"event {i}")

    events = (await client.get("/api/pipeline/state")).json()["events"]
    assert events["status"] == "ok"
    assert [e["summary"] for e in events["items"]] == ["event 2", "event 1", "event 0"]


@pytest.mark.asyncio
@respx.mock
async def test_offline_sections_never_leak_gitea_token(client, wired_store, monkeypatch):
    """D-007: even if an exception stringifies the token, the snapshot
    must not contain it."""
    monkeypatch.setattr(pipeline, "GITEA_TOKEN", "supersecret-token-123")

    respx.route(url__regex=r".*").mock(
        side_effect=httpx.ConnectError("auth supersecret-token-123 refused")
    )
    r = await client.get("/api/pipeline/state")
    assert r.status_code == 200
    assert "supersecret-token-123" not in r.text


# ─── /api/probe allowlist additions (5003, 8087) ────────────────────────


@pytest.mark.parametrize("port", ["5003", "8087"])
def test_probe_allowlist_accepts_new_lab_ports(port):
    assert main._PROBE_ALLOWLIST.match(f"http://localhost:{port}/v2/_catalog")
    assert main._PROBE_ALLOWLIST.match(f"http://127.0.0.1:{port}/")


@pytest.mark.parametrize("port", ["5004", "8080", "8088", "9999"])
def test_probe_allowlist_still_rejects_unknown_ports(port):
    assert not main._PROBE_ALLOWLIST.match(f"http://localhost:{port}/")


def test_probe_rewrite_map_covers_new_ports():
    assert main._PORT_TO_HOST["5003"] == "registry-staging:5000"
    assert main._PORT_TO_HOST["8087"] == "trivy:8080"
