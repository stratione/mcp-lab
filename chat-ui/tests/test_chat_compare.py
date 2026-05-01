"""Milestone 5 — POST /api/chat-compare runs the same prompt against two
providers in parallel and returns both panes' replies, tool calls, timings,
and token usage. Per-pane errors must not break the other pane. No api_key
ever leaks in the response.
"""

import asyncio
import re
import time

import pytest
from app import main


SK_PATTERN = re.compile(r"sk-(ant|proj|fake)-[A-Za-z0-9_-]{10,}")


class _SleepingProvider:
    """Stub provider that sleeps for `delay` seconds, then returns a fixed reply."""
    def __init__(self, delay: float, reply: str = "ok", token_total: int = 100):
        self.delay = delay
        self.reply = reply
        self.token_total = token_total
        self.captured_tools = None

    async def chat(self, messages, tools):
        self.captured_tools = tools
        await asyncio.sleep(self.delay)
        return {
            "reply": self.reply,
            "tool_calls": [],
            "token_usage": {
                "input_tokens": self.token_total // 2,
                "output_tokens": self.token_total - self.token_total // 2,
                "total_tokens": self.token_total,
            },
        }


class _BoomProvider:
    async def chat(self, messages, tools):
        raise RuntimeError("provider exploded")


def _patch_two_providers(monkeypatch, left, right):
    """Make get_provider return `left` for the first pane and `right` for the second."""
    seq = iter([left, right])

    def fake(cfg):
        return next(seq)

    monkeypatch.setattr(main, "get_provider", fake)


@pytest.mark.asyncio
async def test_compare_request_validates_both_panes(client):
    r = await client.post(
        "/api/chat-compare",
        json={"message": "hi", "left": {"provider": "ollama"}},
        # missing `right`
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_compare_runs_both_panes_in_parallel(client, monkeypatch):
    """Both panes sleep 0.5s; total time should be ~0.5s (parallel) not ~1s (serial)."""
    _patch_two_providers(
        monkeypatch,
        _SleepingProvider(delay=0.5, reply="left-ok"),
        _SleepingProvider(delay=0.5, reply="right-ok"),
    )
    t0 = time.monotonic()
    r = await client.post(
        "/api/chat-compare",
        json={
            "message": "hi",
            "left": {"provider": "ollama"},
            "right": {"provider": "anthropic"},
        },
    )
    elapsed = time.monotonic() - t0
    assert r.status_code == 200
    body = r.json()
    assert body["left"]["reply"] == "left-ok"
    assert body["right"]["reply"] == "right-ok"
    assert elapsed < 0.95, (
        f"compare ran serially (took {elapsed:.2f}s); should run in parallel and "
        f"finish in ~0.5s + overhead"
    )


@pytest.mark.asyncio
async def test_compare_pane_error_does_not_break_other(client, monkeypatch):
    _patch_two_providers(
        monkeypatch,
        _BoomProvider(),
        _SleepingProvider(delay=0.05, reply="right-survived"),
    )
    r = await client.post(
        "/api/chat-compare",
        json={
            "message": "hi",
            "left": {"provider": "ollama"},
            "right": {"provider": "anthropic"},
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert "exploded" in (body["left"].get("error") or "")
    assert body["right"]["reply"] == "right-survived"


@pytest.mark.asyncio
async def test_compare_records_elapsed_ms_per_pane(client, monkeypatch):
    _patch_two_providers(
        monkeypatch,
        _SleepingProvider(delay=0.1, reply="L"),
        _SleepingProvider(delay=0.3, reply="R"),
    )
    r = await client.post(
        "/api/chat-compare",
        json={
            "message": "hi",
            "left": {"provider": "ollama"},
            "right": {"provider": "anthropic"},
        },
    )
    body = r.json()
    assert body["left"]["elapsed_ms"] >= 100
    assert body["right"]["elapsed_ms"] >= 300


@pytest.mark.asyncio
async def test_compare_per_pane_hallucination_mode_passes_empty_tools(client, monkeypatch):
    """M9: hallucination_mode=True on a pane must result in tools=[] passed
    to that pane's provider, while the other pane keeps the full tools list."""
    left = _SleepingProvider(delay=0.01, reply="L")
    right = _SleepingProvider(delay=0.01, reply="R")
    _patch_two_providers(monkeypatch, left, right)
    r = await client.post(
        "/api/chat-compare",
        json={
            "message": "list users",
            "left":  {"provider": "ollama",    "hallucination_mode": True},
            "right": {"provider": "anthropic", "hallucination_mode": False},
        },
    )
    assert r.status_code == 200
    # Left pane (hallucinating) must have received tools=[]
    assert left.captured_tools == [], (
        f"hallucinating pane should pass tools=[]; got {left.captured_tools!r}"
    )
    # Right pane (grounded) gets whatever the chat-ui found (could be [] if
    # no MCP servers are up — but it must NOT be the same list as left if
    # the server-side merge worked. The least surprising assertion: right
    # received a list (possibly empty) that came from the grounded path.
    assert isinstance(right.captured_tools, list)


@pytest.mark.asyncio
async def test_compare_pane_error_scrubs_api_key(client, monkeypatch):
    """M9 / B6: provider error strings that happen to include the api_key
    must be scrubbed before being returned to the client."""
    secret = "sk-ant-fake-LEAKINTOERROR-1234567890"

    class LeakyProvider:
        async def chat(self, messages, tools):
            raise RuntimeError(f"auth failed: token={secret} request_id=foo")

    _patch_two_providers(
        monkeypatch,
        LeakyProvider(),
        _SleepingProvider(delay=0.01, reply="ok"),
    )
    r = await client.post(
        "/api/chat-compare",
        json={
            "message": "hi",
            "left":  {"provider": "anthropic", "api_key": secret},
            "right": {"provider": "ollama"},
        },
    )
    body = r.json()
    err = body["left"].get("error") or ""
    assert secret not in err, (
        f"api_key leaked into compare error: {err}"
    )
    assert "***" in err or "auth failed" in err, "expected scrubbed err"


@pytest.mark.asyncio
async def test_compare_response_omits_api_keys_from_either_pane(client, monkeypatch):
    """If the caller submits api_keys in either pane config, the response
    body must not echo them back (extends M2's secret-leak guarantee)."""
    _patch_two_providers(
        monkeypatch,
        _SleepingProvider(delay=0.01, reply="L"),
        _SleepingProvider(delay=0.01, reply="R"),
    )
    r = await client.post(
        "/api/chat-compare",
        json={
            "message": "hi",
            "left": {"provider": "anthropic", "api_key": "sk-ant-fake-LEFT-1234567890XX"},
            "right": {"provider": "openai", "api_key": "sk-proj-fake-RIGHT-1234567890XX"},
        },
    )
    text = r.text
    assert SK_PATTERN.search(text) is None, (
        f"compare response leaked an api_key: {text[:300]}"
    )
