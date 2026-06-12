"""POST /rollback."""
from .conftest import post_promote


async def promote_twice_to_prod(client, fake_copy):
    """Two successful dev→prod promotions; returns (older_digest, newer_digest)."""
    await post_promote(client)
    await post_promote(client)
    return fake_copy.digests[0], fake_copy.digests[1]


async def test_rollback_repoints_to_previous_digest(client, fake_copy, fake_repoint):
    old_digest, new_digest = await promote_twice_to_prod(client, fake_copy)

    resp = await client.post("/rollback", json={
        "image_name": "hello-app", "tag": "latest",
        "environment": "prod", "rolled_back_by": "oncall",
    })
    assert resp.status_code == 201
    body = resp.json()
    assert body["action"] == "rollback"
    assert body["status"] == "success"
    assert body["digest"] == old_digest
    assert body["promoted_by"] == "oncall"
    assert body["from_registry"] == "prod"
    assert body["to_registry"] == "prod"
    assert old_digest in body["detail"]
    # Re-point happens entirely within the target registry — no cross-registry copy.
    assert fake_repoint == [("hello-app", "latest", "prod", old_digest)]
    assert len(fake_copy.calls) == 2  # unchanged


async def test_rollback_default_tag_is_latest(client, fake_copy, fake_repoint):
    await promote_twice_to_prod(client, fake_copy)
    resp = await client.post("/rollback", json={
        "image_name": "hello-app", "environment": "prod", "rolled_back_by": "oncall",
    })
    assert resp.status_code == 201
    assert resp.json()["tag"] == "latest"


async def test_rollback_404_with_no_promotions(client, fake_repoint):
    resp = await client.post("/rollback", json={
        "image_name": "hello-app", "environment": "prod", "rolled_back_by": "oncall",
    })
    assert resp.status_code == 404
    assert "roll back" in resp.json()["detail"]
    assert fake_repoint == []


async def test_rollback_404_with_single_promotion(client, fake_copy, fake_repoint):
    # One promotion = the tag already points at the only known digest.
    await post_promote(client)
    resp = await client.post("/rollback", json={
        "image_name": "hello-app", "environment": "prod", "rolled_back_by": "oncall",
    })
    assert resp.status_code == 404


async def test_rollback_ignores_failed_promotions(client, fake_copy, monkeypatch, lab_db, fake_repoint):
    await promote_twice_to_prod(client, fake_copy)

    async def _fail(image_name, tag, from_registry, to_registry, source_ref=None):
        return False, "", "boom"

    monkeypatch.setattr(lab_db, "copy_image", _fail)
    await post_promote(client)  # failed row, must not count as "current"

    resp = await client.post("/rollback", json={
        "image_name": "hello-app", "environment": "prod", "rolled_back_by": "oncall",
    })
    assert resp.status_code == 201
    assert resp.json()["digest"] == fake_copy.digests[0]


async def test_rollback_scoped_to_environment(client, fake_copy, fake_repoint, monkeypatch):
    monkeypatch.setenv("PROMOTION_FLOW", "three-stage")
    # Two promotions into staging, none into prod.
    await post_promote(client, from_registry="dev", to_registry="staging")
    await post_promote(client, from_registry="dev", to_registry="staging")

    resp = await client.post("/rollback", json={
        "image_name": "hello-app", "environment": "prod", "rolled_back_by": "oncall",
    })
    assert resp.status_code == 404

    resp = await client.post("/rollback", json={
        "image_name": "hello-app", "environment": "staging", "rolled_back_by": "oncall",
    })
    assert resp.status_code == 201
    assert fake_repoint == [("hello-app", "latest", "staging", fake_copy.digests[0])]


async def test_rollback_scoped_to_image_and_tag(client, fake_copy, fake_repoint):
    await post_promote(client, image_name="hello-app", tag="latest")
    await post_promote(client, image_name="other-app", tag="latest")
    # Each image has one promotion → nothing to roll back to.
    resp = await client.post("/rollback", json={
        "image_name": "hello-app", "environment": "prod", "rolled_back_by": "oncall",
    })
    assert resp.status_code == 404


async def test_rollback_environment_validated(client, fake_repoint):
    resp = await client.post("/rollback", json={
        "image_name": "hello-app", "environment": "dev", "rolled_back_by": "oncall",
    })
    assert resp.status_code == 422


async def test_failed_repoint_records_failed_audit_row(client, fake_copy, monkeypatch, lab_db):
    await promote_twice_to_prod(client, fake_copy)

    async def _repoint(image_name, tag, registry_name, digest):
        return False, f"Manifest {digest} no longer present in {registry_name} registry"

    monkeypatch.setattr(lab_db, "repoint_tag", _repoint)
    resp = await client.post("/rollback", json={
        "image_name": "hello-app", "environment": "prod", "rolled_back_by": "oncall",
    })
    assert resp.status_code == 201
    body = resp.json()
    assert body["action"] == "rollback"
    assert body["status"] == "failed"
    assert "no longer present" in body["detail"]


async def test_rollback_audit_row_visible_in_promotions(client, fake_copy, fake_repoint):
    await promote_twice_to_prod(client, fake_copy)
    await client.post("/rollback", json={
        "image_name": "hello-app", "environment": "prod", "rolled_back_by": "oncall",
    })
    resp = await client.get("/promotions")
    actions = [p["action"] for p in resp.json()]
    assert actions == ["rollback", "promote", "promote"]
