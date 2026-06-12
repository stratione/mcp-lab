"""Contract §3 — promotion tools: promote_image registry passthrough, plus
the new rollback_deployment / list_scans / get_promotion_policy tools.
HTTP mocked via HTTPRecorder; shapes match promotion-service v2.
"""

import json

import httpx
import pytest
from mcp.server.fastmcp import FastMCP

from mcp_server import config
from tests.helpers import HTTPRecorder, registered_tools


@pytest.fixture
def fake_httpx(monkeypatch):
    rec = HTTPRecorder()
    monkeypatch.setattr(httpx, "AsyncClient", rec.client_class())
    return rec


@pytest.fixture
def promo_tools(monkeypatch):
    monkeypatch.setattr(config, "PROMOTION_SERVICE_URL", "http://promotion-service:8002")
    from mcp_server.tools import promotion_tools
    mcp = FastMCP("test-promotion")
    promotion_tools.register(mcp)
    return registered_tools(mcp)


# ─── promote_image param passthrough ───

async def test_promote_image_defaults_to_dev_to_prod(fake_httpx, promo_tools):
    fake_httpx.queue({"id": 1, "status": "success"}, status_code=201)
    await promo_tools["promote_image"]("hello-app", "latest", "admin")
    call = fake_httpx.calls[0]
    assert call["url"] == "http://promotion-service:8002/promote"
    assert call["json"] == {
        "image_name": "hello-app",
        "tag": "latest",
        "promoted_by": "admin",
        "from_registry": "dev",
        "to_registry": "prod",
    }


async def test_promote_image_passes_through_registries(fake_httpx, promo_tools):
    fake_httpx.queue({"id": 2, "status": "success"}, status_code=201)
    out = await promo_tools["promote_image"](
        "hello-app", "v1.0.0", "diana", from_registry="staging", to_registry="prod"
    )
    body = fake_httpx.calls[0]["json"]
    assert body["from_registry"] == "staging"
    assert body["to_registry"] == "prod"
    assert json.loads(out)["id"] == 2


async def test_promote_image_blocked_surfaces_detail(fake_httpx, promo_tools):
    """409 from the flow/scan gates must surface the service's detail message."""
    fake_httpx.queue(
        {"detail": "blocked by policy: no passing scan for hello-app:latest in dev"},
        status_code=409,
    )
    with pytest.raises(Exception, match="blocked by policy"):
        await promo_tools["promote_image"]("hello-app", "latest", "admin")


# ─── rollback_deployment ───

async def test_rollback_deployment_posts_to_rollback(fake_httpx, promo_tools):
    fake_httpx.queue(
        {"id": 9, "action": "rollback", "status": "success", "to_registry": "prod"},
        status_code=201,
    )
    out = await promo_tools["rollback_deployment"]("hello-app", "prod", "ops-bot")
    call = fake_httpx.calls[0]
    assert call["method"] == "POST"
    assert call["url"] == "http://promotion-service:8002/rollback"
    assert call["json"] == {
        "image_name": "hello-app",
        "tag": "latest",
        "environment": "prod",
        "rolled_back_by": "ops-bot",
    }
    assert json.loads(out)["action"] == "rollback"


async def test_rollback_deployment_custom_tag(fake_httpx, promo_tools):
    fake_httpx.queue({"id": 10, "action": "rollback"}, status_code=201)
    await promo_tools["rollback_deployment"]("hello-app", "staging", "diana", tag="v1.0.0")
    body = fake_httpx.calls[0]["json"]
    assert body["tag"] == "v1.0.0"
    assert body["environment"] == "staging"


async def test_rollback_deployment_404_surfaces_detail(fake_httpx, promo_tools):
    fake_httpx.queue({"detail": "No previous successful promotion"}, status_code=404)
    with pytest.raises(Exception, match="No previous successful promotion"):
        await promo_tools["rollback_deployment"]("hello-app", "prod", "ops-bot")


# ─── list_scans ───

async def test_list_scans_without_filter(fake_httpx, promo_tools):
    fake_httpx.queue([{"id": 1, "image_name": "hello-app", "passed": True}])
    out = await promo_tools["list_scans"]()
    call = fake_httpx.calls[0]
    assert call["url"] == "http://promotion-service:8002/scans"
    assert call.get("params") is None
    assert json.loads(out)[0]["passed"] is True


async def test_list_scans_with_image_name_filter(fake_httpx, promo_tools):
    fake_httpx.queue([])
    await promo_tools["list_scans"](image_name="hello-app")
    assert fake_httpx.calls[0]["params"] == {"image_name": "hello-app"}


# ─── get_promotion_policy ───

async def test_get_promotion_policy(fake_httpx, promo_tools):
    policy = {
        "flow": "three-stage",
        "require_scan": True,
        "max_critical": 0,
        "legal_promotions": [["dev", "staging"], ["staging", "prod"]],
    }
    fake_httpx.queue(policy)
    out = await promo_tools["get_promotion_policy"]()
    assert fake_httpx.calls[0]["url"] == "http://promotion-service:8002/policy"
    assert json.loads(out) == policy
