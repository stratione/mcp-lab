"""POST /api/test-provider-key — low-cost auth-only ping per provider.

Each test mocks the upstream provider's models endpoint with respx so the
suite stays hermetic (no real network, no real keys consumed). The endpoint
must always return HTTP 200 with {ok, status, message, latency_ms} so the
chat-ui can render the result inline regardless of upstream status code.
"""

import httpx
import pytest
import respx

from app import main


@pytest.fixture(autouse=True)
def reset_keys():
    """Snapshot _API_KEYS so individual tests can mutate it without leaking
    to neighbours."""
    saved = dict(main._API_KEYS)
    yield
    main._API_KEYS.clear()
    main._API_KEYS.update(saved)


# ─── no-network paths ───

@pytest.mark.asyncio
async def test_unknown_provider_returns_ok_false(client):
    r = await client.post("/api/test-provider-key", json={"provider": "totally-fake"})
    body = r.json()
    assert r.status_code == 200
    assert body["ok"] is False
    assert "unknown provider" in body["message"]


@pytest.mark.asyncio
async def test_missing_key_returns_ok_false_without_calling_upstream(client, monkeypatch):
    """No key configured for OpenAI → don't call OpenAI, just report missing."""
    monkeypatch.setitem(main._API_KEYS, "openai", "")
    r = await client.post("/api/test-provider-key", json={"provider": "openai"})
    body = r.json()
    assert r.status_code == 200
    assert body["ok"] is False
    assert "no API key" in body["message"]


# ─── OpenAI ───

@pytest.mark.asyncio
@respx.mock
async def test_openai_valid_key(client, monkeypatch):
    monkeypatch.setitem(main._API_KEYS, "openai", "sk-good")
    route = respx.get("https://api.openai.com/v1/models").mock(
        return_value=httpx.Response(200, json={"data": [{"id": "gpt-4o"}]})
    )
    r = await client.post("/api/test-provider-key", json={"provider": "openai"})
    body = r.json()
    assert body["ok"] is True
    assert body["status"] == 200
    assert "valid" in body["message"]
    # Confirm we actually pinged OpenAI with the key as a Bearer token.
    assert route.called
    sent_auth = route.calls[0].request.headers.get("Authorization", "")
    assert sent_auth == "Bearer sk-good"


@pytest.mark.asyncio
@respx.mock
async def test_openai_401_reports_unauthorized(client, monkeypatch):
    monkeypatch.setitem(main._API_KEYS, "openai", "sk-bad")
    respx.get("https://api.openai.com/v1/models").mock(return_value=httpx.Response(401))
    body = (await client.post("/api/test-provider-key", json={"provider": "openai"})).json()
    assert body["ok"] is False
    assert body["status"] == 401
    assert "Unauthorized" in body["message"]


@pytest.mark.asyncio
@respx.mock
async def test_openai_429_reports_rate_limited(client, monkeypatch):
    monkeypatch.setitem(main._API_KEYS, "openai", "sk-good")
    respx.get("https://api.openai.com/v1/models").mock(return_value=httpx.Response(429))
    body = (await client.post("/api/test-provider-key", json={"provider": "openai"})).json()
    assert body["ok"] is False
    assert body["status"] == 429
    assert "rate" in body["message"].lower() or "billing" in body["message"].lower()


@pytest.mark.asyncio
@respx.mock
async def test_explicit_key_overrides_env_key(client, monkeypatch):
    """The popover passes a typed-but-not-saved key; the endpoint must use IT,
    not whatever's in the env, so the user can validate before pressing Apply."""
    monkeypatch.setitem(main._API_KEYS, "openai", "sk-env")
    route = respx.get("https://api.openai.com/v1/models").mock(return_value=httpx.Response(200, json={"data": []}))
    await client.post("/api/test-provider-key", json={"provider": "openai", "api_key": "sk-typed-in-popover"})
    assert route.called
    assert route.calls[0].request.headers["Authorization"] == "Bearer sk-typed-in-popover"


# ─── Anthropic ───

@pytest.mark.asyncio
@respx.mock
async def test_anthropic_uses_x_api_key_header(client, monkeypatch):
    monkeypatch.setitem(main._API_KEYS, "anthropic", "sk-ant-good")
    route = respx.get("https://api.anthropic.com/v1/models").mock(return_value=httpx.Response(200, json={"data": []}))
    body = (await client.post("/api/test-provider-key", json={"provider": "anthropic"})).json()
    assert body["ok"] is True
    assert route.calls[0].request.headers["x-api-key"] == "sk-ant-good"
    assert route.calls[0].request.headers["anthropic-version"] == "2023-06-01"


# ─── Google Gemini ───

@pytest.mark.asyncio
@respx.mock
async def test_google_passes_key_in_query(client, monkeypatch):
    monkeypatch.setitem(main._API_KEYS, "google", "AIza-good")
    route = respx.get("https://generativelanguage.googleapis.com/v1beta/models").mock(
        return_value=httpx.Response(200, json={"models": []})
    )
    body = (await client.post("/api/test-provider-key", json={"provider": "google"})).json()
    assert body["ok"] is True
    # Google takes the key as a ?key= query param, NOT a header.
    assert "key=AIza-good" in str(route.calls[0].request.url)


# ─── Ollama (no key, base_url instead) ───

@pytest.mark.asyncio
@respx.mock
async def test_ollama_reachable(client):
    respx.get("http://ollama.test:11434/api/tags").mock(
        return_value=httpx.Response(200, json={"models": [{"name": "llama3.1:8b"}, {"name": "qwen2.5:7b"}]})
    )
    body = (await client.post(
        "/api/test-provider-key",
        json={"provider": "ollama", "base_url": "http://ollama.test:11434"},
    )).json()
    assert body["ok"] is True
    assert "2 models" in body["message"]


@pytest.mark.asyncio
@respx.mock
async def test_ollama_unreachable(client):
    respx.get("http://ollama.test:11434/api/tags").mock(side_effect=httpx.ConnectError("nope"))
    body = (await client.post(
        "/api/test-provider-key",
        json={"provider": "ollama", "base_url": "http://ollama.test:11434"},
    )).json()
    assert body["ok"] is False
    assert "unreachable" in body["message"]


# ─── Latency is reported ───

@pytest.mark.asyncio
@respx.mock
async def test_latency_ms_is_present(client, monkeypatch):
    monkeypatch.setitem(main._API_KEYS, "openai", "sk-x")
    respx.get("https://api.openai.com/v1/models").mock(return_value=httpx.Response(200, json={"data": []}))
    body = (await client.post("/api/test-provider-key", json={"provider": "openai"})).json()
    assert isinstance(body["latency_ms"], int)
    assert body["latency_ms"] >= 0
