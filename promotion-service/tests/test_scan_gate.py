"""POST /promote scan gate (PROMOTION_REQUIRE_SCAN=true)."""
import pytest

from .conftest import post_promote, post_scan


@pytest.fixture
def scan_gate(monkeypatch):
    monkeypatch.setenv("PROMOTION_REQUIRE_SCAN", "true")


async def test_no_scan_blocks_with_named_gate(client, fake_copy, scan_gate):
    resp = await post_promote(client)
    assert resp.status_code == 409
    detail = resp.json()["detail"]
    assert "blocked by policy" in detail
    assert "no passing scan for hello-app:latest in dev" in detail
    assert len(fake_copy.calls) == 0


async def test_failed_scan_blocks(client, fake_copy, scan_gate):
    await post_scan(client, critical=3, total=3)
    resp = await post_promote(client)
    assert resp.status_code == 409
    detail = resp.json()["detail"]
    assert "no passing scan for hello-app:latest in dev" in detail
    assert "critical=3" in detail


async def test_passing_scan_allows(client, fake_copy, scan_gate):
    await post_scan(client, critical=0, high=5, total=5)
    resp = await post_promote(client)
    assert resp.status_code == 201
    assert resp.json()["status"] == "success"


async def test_most_recent_scan_wins(client, fake_copy, scan_gate):
    await post_scan(client, critical=0)   # old: pass
    await post_scan(client, critical=9)   # latest: fail
    resp = await post_promote(client)
    assert resp.status_code == 409

    await post_scan(client, critical=0)   # newer pass unblocks
    resp = await post_promote(client)
    assert resp.status_code == 201


async def test_scan_must_match_image_tag_and_from_registry(client, fake_copy, scan_gate):
    # Scans of the wrong tag / registry / image don't satisfy the gate.
    await post_scan(client, tag="v1.0.0")
    await post_scan(client, registry="staging")
    await post_scan(client, image_name="other-app")
    resp = await post_promote(client)
    assert resp.status_code == 409


async def test_gate_checks_from_registry_of_the_hop(client, fake_copy, scan_gate, monkeypatch):
    # In three-stage, staging→prod needs a passing scan in *staging*.
    monkeypatch.setenv("PROMOTION_FLOW", "three-stage")
    await post_scan(client, registry="dev")
    resp = await post_promote(client, from_registry="staging", to_registry="prod")
    assert resp.status_code == 409
    assert "in staging" in resp.json()["detail"]

    await post_scan(client, registry="staging")
    resp = await post_promote(client, from_registry="staging", to_registry="prod")
    assert resp.status_code == 201


async def test_gate_respects_max_critical(client, fake_copy, scan_gate, monkeypatch):
    monkeypatch.setenv("PROMOTION_MAX_CRITICAL", "2")
    await post_scan(client, critical=2)
    resp = await post_promote(client)
    assert resp.status_code == 201


async def test_gate_off_by_default(client, fake_copy):
    # Code default PROMOTION_REQUIRE_SCAN=false → no scan needed (legacy behavior).
    resp = await post_promote(client)
    assert resp.status_code == 201
