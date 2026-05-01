"""Milestone 3 — Hallucination Mode toggle.

When ON:
  1. /api/hallucination-mode reports {enabled: true}
  2. ChatResponse.hallucination_mode == True
  3. The provider receives tools=[]
  4. The system prompt is the permissive HALLUCINATION_SYSTEM_PROMPT
  5. The chat handler does NOT probe MCP servers (no check_servers/list_tools call)

Default OFF and a clean GET returns {enabled: false}.
"""

import pytest
from app import main


@pytest.fixture(autouse=True)
def reset_hallucination_mode():
    """Each test starts with mode OFF and tear-down restores OFF."""
    main._hallucination_mode = False
    yield
    main._hallucination_mode = False


@pytest.mark.asyncio
async def test_default_is_off(client):
    r = await client.get("/api/hallucination-mode")
    assert r.status_code == 200
    assert r.json() == {"enabled": False}


@pytest.mark.asyncio
async def test_post_enables_mode(client):
    r = await client.post("/api/hallucination-mode", json={"enabled": True})
    assert r.status_code == 200
    assert r.json()["enabled"] is True
    g = await client.get("/api/hallucination-mode")
    assert g.json()["enabled"] is True


@pytest.mark.asyncio
async def test_post_disables_mode(client):
    await client.post("/api/hallucination-mode", json={"enabled": True})
    r = await client.post("/api/hallucination-mode", json={"enabled": False})
    assert r.json()["enabled"] is False
    g = await client.get("/api/hallucination-mode")
    assert g.json()["enabled"] is False


class _CapturingProvider:
    """Stub that records what the chat handler hands it."""
    def __init__(self):
        self.captured_messages = None
        self.captured_tools = None

    async def chat(self, messages, tools):
        self.captured_messages = messages
        self.captured_tools = tools
        return {
            "reply": "stubbed",
            "tool_calls": [],
            "token_usage": {"input_tokens": 1, "output_tokens": 1, "total_tokens": 2},
        }


@pytest.fixture
def capturing_provider(monkeypatch):
    cap = _CapturingProvider()
    monkeypatch.setattr(main, "get_provider", lambda cfg: cap)
    return cap


@pytest.mark.asyncio
async def test_chat_response_includes_hallucination_mode_flag_when_on(
    client, capturing_provider
):
    await client.post("/api/hallucination-mode", json={"enabled": True})
    r = await client.post("/api/chat", json={"message": "list users", "history": []})
    assert r.status_code == 200
    assert r.json().get("hallucination_mode") is True


@pytest.mark.asyncio
async def test_chat_response_omits_hallucination_flag_default(
    client, capturing_provider
):
    """When mode is OFF, the response either omits the flag or sets it to False."""
    r = await client.post("/api/chat", json={"message": "hi", "history": []})
    body = r.json()
    assert body.get("hallucination_mode", False) is False


@pytest.mark.asyncio
async def test_chat_passes_empty_tools_when_on(client, capturing_provider):
    await client.post("/api/hallucination-mode", json={"enabled": True})
    await client.post("/api/chat", json={"message": "hi", "history": []})
    assert capturing_provider.captured_tools == [], (
        f"hallucination mode must pass tools=[], got {capturing_provider.captured_tools!r}"
    )


@pytest.mark.asyncio
async def test_chat_uses_permissive_prompt_when_on(client, capturing_provider):
    await client.post("/api/hallucination-mode", json={"enabled": True})
    await client.post("/api/chat", json={"message": "hi", "history": []})
    assert capturing_provider.captured_messages is not None
    sys_msg = capturing_provider.captured_messages[0]
    assert sys_msg["role"] == "system"
    # The permissive prompt must NOT contain the grounded-mode safety language.
    assert "DO NOT guess" not in sys_msg["content"]
    assert "OFFLINE" not in sys_msg["content"]
    # And it must contain the permissive cue.
    assert "confident" in sys_msg["content"].lower()


@pytest.mark.asyncio
async def test_chat_uses_grounded_prompt_when_off(client, capturing_provider):
    """Regression guard: with mode OFF the existing safety prompt remains in place."""
    await client.post("/api/chat", json={"message": "hi", "history": []})
    sys_msg = capturing_provider.captured_messages[0]
    assert "DO NOT guess" in sys_msg["content"] or "do not guess" in sys_msg["content"].lower()


@pytest.mark.asyncio
async def test_chat_does_not_probe_mcp_when_on(client, capturing_provider, monkeypatch):
    """When mode is ON, the handler must NOT call check_servers or list_tools.
    The audience is watching — even a hidden probe could ground the model."""
    probe_log: list[str] = []

    async def boom_check_servers():
        probe_log.append("check_servers")
        raise RuntimeError("must not be called when hallucination mode is ON")

    async def boom_list_tools():
        probe_log.append("list_tools")
        raise RuntimeError("must not be called when hallucination mode is ON")

    monkeypatch.setattr(main, "check_servers", boom_check_servers)
    monkeypatch.setattr(main, "list_tools", boom_list_tools)

    await client.post("/api/hallucination-mode", json={"enabled": True})
    r = await client.post("/api/chat", json={"message": "list users", "history": []})
    assert r.status_code == 200, f"chat returned {r.status_code}: {r.text}"
    assert probe_log == [], f"hallucination mode probed MCP servers: {probe_log}"
