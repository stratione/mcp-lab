"""GET /policy and GET /health."""


async def test_health_unchanged(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok", "service": "promotion-service"}


async def test_policy_code_defaults(client):
    resp = await client.get("/policy")
    assert resp.status_code == 200
    assert resp.json() == {
        "flow": "two-stage",
        "require_scan": False,
        "max_critical": 0,
        "legal_promotions": [["dev", "prod"]],
    }


async def test_policy_three_stage(client, monkeypatch):
    monkeypatch.setenv("PROMOTION_FLOW", "three-stage")
    monkeypatch.setenv("PROMOTION_REQUIRE_SCAN", "true")
    monkeypatch.setenv("PROMOTION_MAX_CRITICAL", "2")
    resp = await client.get("/policy")
    assert resp.json() == {
        "flow": "three-stage",
        "require_scan": True,
        "max_critical": 2,
        "legal_promotions": [["dev", "staging"], ["staging", "prod"]],
    }


async def test_policy_env_read_at_request_time(client, monkeypatch):
    # Policy is not baked in at import — flipping env between requests changes it.
    resp = await client.get("/policy")
    assert resp.json()["flow"] == "two-stage"
    monkeypatch.setenv("PROMOTION_FLOW", "three-stage")
    resp = await client.get("/policy")
    assert resp.json()["flow"] == "three-stage"


async def test_policy_bad_max_critical_falls_back_to_zero(client, monkeypatch):
    monkeypatch.setenv("PROMOTION_MAX_CRITICAL", "not-a-number")
    resp = await client.get("/policy")
    assert resp.json()["max_critical"] == 0


async def test_policy_unknown_flow_treated_as_two_stage(client, monkeypatch):
    monkeypatch.setenv("PROMOTION_FLOW", "four-stage")
    resp = await client.get("/policy")
    assert resp.json()["legal_promotions"] == [["dev", "prod"]]
