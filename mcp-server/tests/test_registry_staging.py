"""Contract §3 — registry tools accept dev|staging|prod everywhere; staging
requests route to STAGING_REGISTRY_URL. HTTP mocked via HTTPRecorder.
"""

import json

import httpx
import pytest
from mcp.server.fastmcp import FastMCP

from mcp_server import config
from mcp_server.clients import registry_client
from tests.helpers import HTTPRecorder, registered_tools


@pytest.fixture
def fake_httpx(monkeypatch):
    rec = HTTPRecorder()
    monkeypatch.setattr(httpx, "AsyncClient", rec.client_class())
    return rec


@pytest.fixture
def registry_tools_registry():
    from mcp_server.tools import registry_tools
    mcp = FastMCP("test-registry")
    registry_tools.register(mcp)
    return registered_tools(mcp)


async def test_list_registries_includes_staging(registry_tools_registry):
    out = await registry_tools_registry["list_registries"]()
    assert json.loads(out) == ["dev", "staging", "prod"]


def test_registry_url_routing():
    assert registry_client.registry_url("dev") == config.DEV_REGISTRY_URL
    assert registry_client.registry_url("staging") == config.STAGING_REGISTRY_URL
    assert registry_client.registry_url("prod") == config.PROD_REGISTRY_URL


def test_registry_url_rejects_unknown():
    with pytest.raises(ValueError, match="dev, staging, prod"):
        registry_client.registry_url("qa")


def test_staging_registry_url_default():
    """Code default for STAGING_REGISTRY_URL is the compose service name."""
    import importlib
    import os
    if "STAGING_REGISTRY_URL" not in os.environ:
        importlib.reload(config)
        assert config.STAGING_REGISTRY_URL == "http://registry-staging:5000"


async def test_list_images_routes_to_staging(fake_httpx, registry_tools_registry, monkeypatch):
    monkeypatch.setattr(config, "STAGING_REGISTRY_URL", "http://registry-staging:5000")
    fake_httpx.queue({"repositories": ["hello-app"]})
    out = await registry_tools_registry["list_registry_images"](registry="staging")
    assert fake_httpx.calls[0]["url"] == "http://registry-staging:5000/v2/_catalog"
    parsed = json.loads(out)
    assert parsed == {"registry": "staging", "images": ["hello-app"]}


async def test_list_tags_routes_to_staging(fake_httpx, registry_tools_registry, monkeypatch):
    monkeypatch.setattr(config, "STAGING_REGISTRY_URL", "http://registry-staging:5000")
    fake_httpx.queue({"tags": ["latest", "v1.0.0"]})
    out = await registry_tools_registry["list_image_tags"]("hello-app", registry="staging")
    assert fake_httpx.calls[0]["url"] == "http://registry-staging:5000/v2/hello-app/tags/list"
    assert json.loads(out)["tags"] == ["latest", "v1.0.0"]


async def test_get_manifest_routes_to_staging(fake_httpx, registry_tools_registry, monkeypatch):
    monkeypatch.setattr(config, "STAGING_REGISTRY_URL", "http://registry-staging:5000")
    fake_httpx.queue(
        {"schemaVersion": 2},
        headers={"docker-content-digest": "sha256:abc", "content-type": "application/json"},
    )
    out = await registry_tools_registry["get_image_manifest"]("hello-app", "latest", registry="staging")
    assert fake_httpx.calls[0]["url"] == "http://registry-staging:5000/v2/hello-app/manifests/latest"
    assert json.loads(out)["digest"] == "sha256:abc"


async def test_tag_image_routes_to_staging(fake_httpx, registry_tools_registry, monkeypatch):
    monkeypatch.setattr(config, "STAGING_REGISTRY_URL", "http://registry-staging:5000")
    # tag_image does a GET manifest then a PUT manifest
    fake_httpx.queue(
        {"schemaVersion": 2},
        headers={"docker-content-digest": "sha256:abc",
                 "content-type": "application/vnd.oci.image.manifest.v1+json"},
    )
    fake_httpx.queue({}, status_code=201)
    out = await registry_tools_registry["tag_image"]("hello-app", "latest", "v1.0.0", registry="staging")
    put = fake_httpx.calls[1]
    assert put["method"] == "PUT"
    assert put["url"] == "http://registry-staging:5000/v2/hello-app/manifests/v1.0.0"
    assert json.loads(out)["status"] == "success"
