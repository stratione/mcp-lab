"""Event store (app/events.py) + /api/events endpoints (contract §4).

Covers the persisted ring buffer (cap, atomicity, corrupt-file recovery),
the manual POST /api/events ingest, and the Gitea webhook receiver's
normalization — including the "always 200, never raise" guarantee for
junk payloads.
"""

import json

import pytest

from app import main
from app.events import EVENTS_CAP, EventStore, normalize_gitea_event


@pytest.fixture
def store(tmp_path):
    return EventStore(tmp_path / "events.json")


@pytest.fixture
def wired_store(tmp_path, monkeypatch):
    """A fresh store wired into the FastAPI app for endpoint tests."""
    s = EventStore(tmp_path / "events.json")
    monkeypatch.setattr(main, "_event_store", s)
    return s


# ─── EventStore unit tests ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_append_stamps_id_and_received_at(store):
    rec = await store.append("manual", "note", "hello world", "some detail")
    assert rec["id"] == 1
    assert rec["source"] == "manual"
    assert rec["type"] == "note"
    assert rec["summary"] == "hello world"
    assert rec["detail"] == "some detail"
    assert rec["received_at"]  # ISO timestamp present

    rec2 = await store.append("deploy", "deploy.ok", "deployed")
    assert rec2["id"] == 2


@pytest.mark.asyncio
async def test_list_is_newest_first_and_respects_limit(store):
    for i in range(5):
        await store.append("manual", "note", f"event {i}")
    out = await store.list(limit=3)
    assert [e["summary"] for e in out] == ["event 4", "event 3", "event 2"]


@pytest.mark.asyncio
async def test_ring_buffer_drops_oldest_at_cap(tmp_path):
    small = EventStore(tmp_path / "events.json", cap=5)
    for i in range(8):
        await small.append("manual", "note", f"event {i}")
    out = await small.list(limit=50)
    assert len(out) == 5
    # Newest kept, oldest three dropped; ids keep incrementing.
    assert [e["summary"] for e in out] == [f"event {i}" for i in (7, 6, 5, 4, 3)]
    assert out[0]["id"] == 8


def test_default_cap_is_500():
    assert EVENTS_CAP == 500


@pytest.mark.asyncio
async def test_events_persist_across_store_instances(tmp_path):
    path = tmp_path / "events.json"
    first = EventStore(path)
    await first.append("scan", "scan.passed", "scan ok")

    reborn = EventStore(path)
    out = await reborn.list()
    assert len(out) == 1
    assert out[0]["summary"] == "scan ok"
    # id sequence continues, no collisions after a "restart"
    rec = await reborn.append("manual", "note", "after restart")
    assert rec["id"] == 2


@pytest.mark.asyncio
async def test_corrupt_file_recovers_to_empty_store(tmp_path):
    path = tmp_path / "events.json"
    path.write_text("{definitely not json[")
    store = EventStore(path)
    assert await store.list() == []
    rec = await store.append("manual", "note", "fresh start")
    assert rec["id"] == 1
    # And the file is valid JSON again afterwards.
    assert json.loads(path.read_text())[0]["summary"] == "fresh start"


@pytest.mark.asyncio
async def test_wrong_shape_file_recovers_to_empty_store(tmp_path):
    path = tmp_path / "events.json"
    path.write_text('{"not": "a list"}')
    store = EventStore(path)
    assert await store.list() == []


@pytest.mark.asyncio
async def test_write_is_atomic_no_temp_file_left_behind(store):
    await store.append("manual", "note", "x")
    leftovers = [p for p in store.path.parent.iterdir() if p.name != store.path.name]
    assert leftovers == []


# ─── POST /api/events + GET /api/events ─────────────────────────────────


@pytest.mark.asyncio
async def test_post_event_returns_201_with_id(client, wired_store):
    r = await client.post("/api/events", json={
        "source": "runner", "type": "ci.success", "summary": "CI built hello-app",
    })
    assert r.status_code == 201
    assert r.json() == {"id": 1}


@pytest.mark.asyncio
async def test_post_event_rejects_unknown_source(client, wired_store):
    r = await client.post("/api/events", json={
        "source": "mars-rover", "type": "x", "summary": "y",
    })
    assert r.status_code == 400
    assert "source" in r.json()["detail"]


@pytest.mark.asyncio
async def test_post_event_rejects_non_json_body(client, wired_store):
    r = await client.post("/api/events", content=b"not json",
                          headers={"Content-Type": "application/json"})
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_get_events_newest_first_with_limit(client, wired_store):
    for i in range(4):
        await client.post("/api/events", json={
            "source": "manual", "type": "note", "summary": f"event {i}",
        })
    r = await client.get("/api/events", params={"limit": 2})
    assert r.status_code == 200
    events = r.json()["events"]
    assert [e["summary"] for e in events] == ["event 3", "event 2"]


# ─── POST /api/events/gitea (webhook receiver) ──────────────────────────


PUSH_PAYLOAD = {
    "ref": "refs/heads/main",
    "after": "abc1234def5678900000",
    "repository": {"full_name": "mcpadmin/sample-app"},
    "head_commit": {
        "id": "abc1234def5678900000",
        "message": "fix: handle empty tags\n\nlonger body here",
    },
}


@pytest.mark.asyncio
async def test_gitea_push_webhook_normalized(client, wired_store):
    r = await client.post("/api/events/gitea", json=PUSH_PAYLOAD,
                          headers={"X-Gitea-Event": "push"})
    assert r.status_code == 200
    assert r.json()["ok"] is True

    events = (await client.get("/api/events")).json()["events"]
    ev = events[0]
    assert ev["source"] == "gitea"
    assert ev["type"] == "push"
    assert ev["summary"] == "push to mcpadmin/sample-app: abc1234 fix: handle empty tags"


@pytest.mark.asyncio
async def test_gitea_create_webhook_normalized(client, wired_store):
    payload = {
        "ref": "v1.0.0",
        "ref_type": "tag",
        "repository": {"full_name": "mcpadmin/sample-app"},
    }
    r = await client.post("/api/events/gitea", json=payload,
                          headers={"X-Gitea-Event": "create"})
    assert r.status_code == 200

    ev = (await client.get("/api/events")).json()["events"][0]
    assert ev["type"] == "create"
    assert ev["summary"] == "tag v1.0.0 created in mcpadmin/sample-app"


@pytest.mark.asyncio
async def test_gitea_unknown_event_stored_under_header_type(client, wired_store):
    r = await client.post("/api/events/gitea", json={
        "repository": {"full_name": "mcpadmin/sample-app"},
    }, headers={"X-Gitea-Event": "issues"})
    assert r.status_code == 200

    ev = (await client.get("/api/events")).json()["events"][0]
    assert ev["type"] == "issues"
    assert "mcpadmin/sample-app" in ev["summary"]


@pytest.mark.asyncio
async def test_gitea_junk_payload_still_200(client, wired_store):
    """Gitea disables hooks that error — junk must never break the receiver."""
    r = await client.post("/api/events/gitea", content=b"\x00!!!not json!!!",
                          headers={"X-Gitea-Event": "push"})
    assert r.status_code == 200
    # Still recorded so the feed shows SOMETHING arrived.
    ev = (await client.get("/api/events")).json()["events"][0]
    assert ev["source"] == "gitea"
    assert ev["type"] == "push"


@pytest.mark.asyncio
async def test_gitea_no_header_no_body_still_200(client, wired_store):
    r = await client.post("/api/events/gitea")
    assert r.status_code == 200
    ev = (await client.get("/api/events")).json()["events"][0]
    assert ev["type"] == "unknown"


def test_normalize_tolerates_weird_shapes():
    """Pure-function fuzz: none of these may raise."""
    for payload in (None, [], "string", 42,
                    {"head_commit": "not-a-dict"},
                    {"repository": []},
                    {"repository": {"full_name": None}}):
        type_, summary, _ = normalize_gitea_event(payload, "push")
        assert isinstance(type_, str) and isinstance(summary, str)
