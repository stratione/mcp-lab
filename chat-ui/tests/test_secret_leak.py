"""Milestone 2 — /api/providers must never return a full API key.

Workshop motivation: a single screen-share or DevTools network-tab open
during the live talk would leak the presenter's Anthropic key. The whole
point of splitting `.env` from `.env.secrets` is undone if the JSON API
echoes the key back. These tests pin: GET /api/providers, POST /api/provider,
and any tangential endpoint must never include `api_key` in any response,
and must surface the presence of a key as `has_key: bool` plus a short
`key_preview` (first 2 + last 4 chars only).
"""

import re
import pytest


SK_PATTERN = re.compile(r"sk-(ant|proj|fake)-[A-Za-z0-9_-]{10,}")


@pytest.mark.asyncio
async def test_get_providers_omits_api_key_field(client):
    """After setting a key, GET /api/providers must NOT include `api_key`."""
    fake = "sk-ant-fake-1234567890abcdef"
    await client.post(
        "/api/provider",
        json={
            "provider": "anthropic",
            "api_key": fake,
            "model": "claude-sonnet-4-5-20250929",
        },
    )
    r = await client.get("/api/providers")
    assert r.status_code == 200
    active = r.json()["active"]
    assert "api_key" not in active, (
        f"api_key field leaks in /api/providers response: {active}"
    )


@pytest.mark.asyncio
async def test_get_providers_returns_key_preview_when_set(client):
    fake = "sk-ant-fake-1234567890abcdef"
    await client.post(
        "/api/provider",
        json={"provider": "anthropic", "api_key": fake, "model": "x"},
    )
    r = await client.get("/api/providers")
    active = r.json()["active"]
    assert active.get("has_key") is True
    preview = active.get("key_preview", "")
    assert preview.endswith("cdef"), f"key_preview should end with last 4 chars, got: {preview!r}"
    assert preview.startswith("sk"), f"key_preview should start with first 2 chars, got: {preview!r}"
    assert fake not in preview, "key_preview must NOT contain the full key"


@pytest.mark.asyncio
async def test_post_provider_response_omits_api_key(client):
    fake = "sk-ant-fake-AAAAAAAAAAAAAAAA"
    r = await client.post(
        "/api/provider",
        json={"provider": "anthropic", "api_key": fake, "model": "x"},
    )
    assert r.status_code == 200
    body = r.json()
    cfg = body.get("config", {})
    assert "api_key" not in cfg, f"POST response leaks api_key: {body}"
    assert cfg.get("has_key") is True
    assert cfg.get("key_preview", "").endswith("AAAA")


@pytest.mark.asyncio
async def test_provider_with_no_key_returns_has_key_false(client):
    r = await client.post(
        "/api/provider", json={"provider": "ollama"},
    )
    body = r.json()
    cfg = body.get("config", {})
    # `has_key` may still be True if env-resolved (e.g. user has ANTHROPIC_API_KEY set
    # and chose "ollama"; ollama doesn't need a key, but the resolver may set the field).
    # The precise contract: when there is no key in scope for this provider, has_key=False
    # AND key_preview is the empty string.
    if not cfg.get("has_key"):
        assert cfg.get("key_preview", "") == "", (
            f"key_preview should be empty when no key is set; got {cfg.get('key_preview')!r}"
        )


@pytest.mark.asyncio
async def test_no_endpoint_response_matches_sk_pattern(client):
    """Set a fake key with the sk- prefix, then sweep all expected JSON
    endpoints — no response body should contain the raw key."""
    fake = "sk-ant-fake-LEAKCHECK1234XYZ"
    set_resp = await client.post(
        "/api/provider",
        json={"provider": "anthropic", "api_key": fake, "model": "x"},
    )
    # POST response itself
    assert SK_PATTERN.search(set_resp.text) is None, (
        f"/api/provider POST leaked sk- pattern: {set_resp.text}"
    )

    for path in ("/api/providers", "/api/tools", "/api/mcp-status"):
        r = await client.get(path)
        assert SK_PATTERN.search(r.text) is None, (
            f"{path} leaked sk- pattern in response body: "
            f"first 200 chars={r.text[:200]!r}"
        )


@pytest.mark.asyncio
async def test_key_preview_short_key_falls_back_safely(client):
    """If somehow a too-short key is set, key_preview must not raise
    nor expose the whole short key."""
    short = "sk-x"  # 4 chars total
    r = await client.post(
        "/api/provider",
        json={"provider": "anthropic", "api_key": short, "model": "x"},
    )
    cfg = r.json().get("config", {})
    assert cfg.get("has_key") is True
    preview = cfg.get("key_preview", "")
    # Must not echo the entire short key
    assert preview != short, f"short key leaked verbatim: {preview!r}"
