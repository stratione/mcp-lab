"""POST /promote: flow validation matrix + audit recording."""
import pytest

from .conftest import post_promote


async def test_legacy_promote_defaults_dev_to_prod(client, fake_copy):
    resp = await post_promote(client)  # no from/to in body — v1-shaped request
    assert resp.status_code == 201
    body = resp.json()
    assert body["from_registry"] == "dev"
    assert body["to_registry"] == "prod"
    assert body["action"] == "promote"
    assert body["status"] == "success"
    assert body["digest"] == fake_copy.digests[0]
    assert body["created_at"]
    # v1 fields still present for old consumers
    assert body["source_registry"] == "http://registry-dev:5000"
    assert body["target_registry"] == "http://registry-prod:5000"
    assert fake_copy.calls == [("hello-app", "latest", "dev", "prod")]


@pytest.mark.parametrize("from_reg,to_reg", [
    ("dev", "staging"),
    ("staging", "prod"),
    ("staging", "dev"),
    ("prod", "dev"),
    ("dev", "dev"),
])
async def test_two_stage_blocks_everything_but_dev_prod(client, fake_copy, from_reg, to_reg):
    resp = await post_promote(client, from_registry=from_reg, to_registry=to_reg)
    assert resp.status_code == 409
    assert "blocked by policy" in resp.json()["detail"]
    assert len(fake_copy.calls) == 0


@pytest.mark.parametrize("from_reg,to_reg", [("dev", "staging"), ("staging", "prod")])
async def test_three_stage_legal_hops(client, fake_copy, monkeypatch, from_reg, to_reg):
    monkeypatch.setenv("PROMOTION_FLOW", "three-stage")
    resp = await post_promote(client, from_registry=from_reg, to_registry=to_reg)
    assert resp.status_code == 201
    assert resp.json()["from_registry"] == from_reg
    assert resp.json()["to_registry"] == to_reg


@pytest.mark.parametrize("from_reg,to_reg", [
    ("dev", "prod"),       # skipping staging is the canonical violation
    ("staging", "dev"),
    ("prod", "staging"),
    ("prod", "prod"),
])
async def test_three_stage_blocks_illegal_hops(client, fake_copy, monkeypatch, from_reg, to_reg):
    monkeypatch.setenv("PROMOTION_FLOW", "three-stage")
    resp = await post_promote(client, from_registry=from_reg, to_registry=to_reg)
    assert resp.status_code == 409
    detail = resp.json()["detail"]
    assert "blocked by policy" in detail
    assert from_reg in detail and to_reg in detail
    assert len(fake_copy.calls) == 0


async def test_unknown_registry_name_rejected_by_validation(client, fake_copy):
    resp = await post_promote(client, from_registry="qa", to_registry="prod")
    assert resp.status_code == 422


async def test_blocked_promotion_writes_no_audit_row(client, fake_copy, monkeypatch):
    monkeypatch.setenv("PROMOTION_FLOW", "three-stage")
    resp = await post_promote(client, from_registry="dev", to_registry="prod")
    assert resp.status_code == 409
    resp = await client.get("/promotions")
    assert resp.json() == []


async def test_copy_failure_records_failed_row(client, monkeypatch, lab_db):
    async def _copy(image_name, tag, from_registry, to_registry):
        return False, "", f"Image {image_name}:{tag} not found in {from_registry} registry"

    monkeypatch.setattr(lab_db, "copy_image", _copy)
    resp = await post_promote(client)
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "failed"
    assert "not found in dev registry" in body["detail"]


async def test_promotions_list_and_get_by_id(client, fake_copy):
    first = (await post_promote(client, tag="v1.0.0")).json()
    second = (await post_promote(client, tag="v2.0.0")).json()

    resp = await client.get("/promotions")
    assert resp.status_code == 200
    items = resp.json()
    assert [i["id"] for i in items] == [second["id"], first["id"]]  # newest first
    assert all(i["action"] == "promote" for i in items)

    resp = await client.get(f"/promotions/{first['id']}")
    assert resp.status_code == 200
    assert resp.json()["tag"] == "v1.0.0"

    resp = await client.get("/promotions/9999")
    assert resp.status_code == 404


async def test_registry_urls_come_from_env(client, fake_copy, monkeypatch):
    monkeypatch.setenv("DEV_REGISTRY_URL", "http://example-dev:5000")
    monkeypatch.setenv("PROD_REGISTRY_URL", "http://example-prod:5000")
    resp = await post_promote(client)
    body = resp.json()
    assert body["source_registry"] == "http://example-dev:5000"
    assert body["target_registry"] == "http://example-prod:5000"
