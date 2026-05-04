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
async def test_chat_uses_grounded_prompt_when_off(client, capturing_provider, monkeypatch):
    """Regression guard: with mode OFF and at least one MCP server ONLINE, the
    grounded safety prompt remains in place. We mock check_servers so the test
    doesn't depend on real MCP server reachability — without a mocked online
    server the chat handler now (correctly) returns the vanilla prompt instead."""
    async def fake_check_servers():
        return [{"name": "user", "url": "http://x", "port": 8003,
                 "status": "online", "tools": ["list_users"], "tool_count": 1}]
    async def fake_list_tools():
        return [{"name": "list_users", "description": "list", "inputSchema": {}}]
    monkeypatch.setattr(main, "check_servers", fake_check_servers)
    monkeypatch.setattr(main, "list_tools", fake_list_tools)

    await client.post("/api/chat", json={"message": "hi", "history": []})
    sys_msg = capturing_provider.captured_messages[0]
    assert "DO NOT guess" in sys_msg["content"] or "do not guess" in sys_msg["content"].lower()


@pytest.mark.asyncio
async def test_grounded_prompt_lists_only_online_servers(client, capturing_provider, monkeypatch):
    """Workshop pedagogy guard: when SOME servers are online and others are
    offline, the system prompt must mention ONLY the online ones — never
    leak the names of offline servers (mcp-promotion, mcp-runner, etc.) into
    the LLM's view, otherwise the model will explain "mcp-promotion is offline
    — run docker compose up -d mcp-promotion" and spoil the reveal."""
    async def fake_check_servers():
        return [
            {"name": "user", "url": "http://x", "port": 8003,
             "status": "online", "tools": ["list_users", "create_user"], "tool_count": 2},
            {"name": "promotion", "url": "http://y", "port": 8006,
             "status": "offline", "tools": [], "tool_count": 0},
            {"name": "runner", "url": "http://z", "port": 8007,
             "status": "offline", "tools": [], "tool_count": 0},
        ]
    async def fake_list_tools():
        return [
            {"name": "list_users", "description": "list", "inputSchema": {}},
            {"name": "create_user", "description": "create", "inputSchema": {}},
        ]
    monkeypatch.setattr(main, "check_servers", fake_check_servers)
    monkeypatch.setattr(main, "list_tools", fake_list_tools)

    await client.post("/api/chat", json={"message": "hi", "history": []})
    sys_msg = capturing_provider.captured_messages[0]
    content = sys_msg["content"]
    # Online tools MUST be present so the model can use them.
    assert "list_users" in content
    assert "create_user" in content
    # Offline server names MUST NOT appear — neither bare nor mcp-prefixed.
    for forbidden in ("promotion", "runner", "mcp-promotion", "mcp-runner", "OFFLINE"):
        assert forbidden not in content, (
            f"prompt leaked offline-server reference {forbidden!r}: {content!r}"
        )
    # And the "docker compose up" leak path is gone.
    for forbidden in ("docker compose", "compose up", "compose up -d"):
        assert forbidden not in content, (
            f"prompt still tells the LLM how to enable services ({forbidden!r}): {content!r}"
        )


@pytest.mark.asyncio
async def test_chat_uses_vanilla_prompt_when_no_mcp_online(client, capturing_provider, monkeypatch):
    """Cold-open guard: when ALL MCP servers are offline (workshop's starting
    posture), the system prompt must NOT mention MCP, tools, or "OFFLINE" —
    the model should behave like a normal chatbot so the workshop's first
    "bring up an MCP" moment lands cleanly. Without this, the model sees the
    offline list in its prompt and explains it back to the user, which spoils
    the surprise."""
    async def fake_check_servers():
        return [
            {"name": "user", "url": "http://x", "port": 8003,
             "status": "offline", "tools": [], "tool_count": 0},
            {"name": "gitea", "url": "http://y", "port": 8004,
             "status": "offline", "tools": [], "tool_count": 0},
        ]
    async def fake_list_tools():
        # Synthetic tool is always present; the chat path must scrub it too.
        return [{"name": "list_mcp_servers", "description": "meta", "inputSchema": {}}]
    monkeypatch.setattr(main, "check_servers", fake_check_servers)
    monkeypatch.setattr(main, "list_tools", fake_list_tools)

    await client.post("/api/chat", json={"message": "hi", "history": []})
    sys_msg = capturing_provider.captured_messages[0]
    content = sys_msg["content"]
    for forbidden in ("MCP", "OFFLINE", "tool", "Model Context Protocol", "server"):
        assert forbidden not in content and forbidden.lower() not in content.lower(), (
            f"vanilla prompt leaked the term {forbidden!r}: {content!r}"
        )
    # And the synthetic meta-tool must be hidden from the LLM.
    assert capturing_provider.captured_tools == [], (
        f"cold-open must pass tools=[]; got {capturing_provider.captured_tools!r}"
    )


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
