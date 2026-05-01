"""Milestone 0 smoke tests.

Two tests only:
  1. /health responds — proves the FastAPI app loads and the test harness is wired.
  2. mcp_client._list_tools_from_server propagates Mcp-Session-Id from the
     `initialize` response into the subsequent `tools/list` request, using
     a single httpx client. This is the regression pin for D-012 — the
     uncommitted fix in mcp_client.py that we want to preserve.
"""

import pytest


@pytest.mark.asyncio
async def test_health_endpoint_returns_ok(client):
    r = await client.get("/health")
    assert r.status_code == 200


def test_parse_response_skips_sse_notifications():
    """Regression pin: SSE responses can interleave `notifications/message`
    events (from ctx.info()) before the JSON-RPC response. _parse_response
    must skip those and return the message that carries a `result` key.

    Without this, a tool call that uses ctx.info() returns `{}` to the
    chat-ui (because the first `data:` line is the notification).
    """
    from app import mcp_client
    import httpx

    sse_body = (
        "event: message\n"
        'data: {"method":"notifications/message","params":{"level":"info","data":"hi"},"jsonrpc":"2.0"}\n'
        "\n"
        "event: message\n"
        'data: {"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"OK"}]}}\n'
        "\n"
    )

    class FakeResp:
        status_code = 200
        headers = {"content-type": "text/event-stream"}
        text = sse_body

        def json(self):
            raise AssertionError("should not be called for SSE")

    parsed = mcp_client._parse_response(FakeResp())
    assert "result" in parsed, (
        f"_parse_response returned {parsed!r}; should have skipped the "
        "leading notification and returned the result-bearing message"
    )
    assert parsed["result"]["content"][0]["text"] == "OK"


@pytest.mark.asyncio
async def test_mcp_session_id_propagation_regression(monkeypatch):
    """Pin the session-id-propagation behaviour in mcp_client.py.

    The MCP streamable-http transport hands back an Mcp-Session-Id header in
    the `initialize` response. Subsequent JSON-RPC calls on the same logical
    session MUST send that header back. The fix in chat-ui/app/mcp_client.py
    creates one httpx.AsyncClient that lives across both requests so the
    header set by the first response is sent on the second.

    Regression mode this guards against: someone refactors the helper back to
    `async with httpx.AsyncClient() as c:` per request, which loses the
    session and makes `tools/list` return empty for stateful MCP servers.
    """
    from app import mcp_client

    captured_calls: list[dict] = []

    class FakeResponse:
        def __init__(self, session_id: str | None):
            self.status_code = 200
            self.headers = {"content-type": "application/json"}
            if session_id:
                self.headers["Mcp-Session-Id"] = session_id
            self.text = '{"result": {"tools": []}}'

        def raise_for_status(self):
            pass

        def json(self):
            return {"result": {"tools": []}}

    class FakeAsyncClient:
        instances: list["FakeAsyncClient"] = []

        def __init__(self, *args, **kwargs):
            self.headers: dict[str, str] = {}
            self.posts: list[tuple[str, dict]] = []
            FakeAsyncClient.instances.append(self)

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def post(self, url, **kwargs):
            sent_headers = dict(self.headers)
            sent_headers.update(kwargs.get("headers") or {})
            captured_calls.append({"url": url, "headers": sent_headers})
            self.posts.append((url, sent_headers))
            # Simulate the streamable-http server returning a session id
            # only on the initialize response.
            body = kwargs.get("json") or {}
            if body.get("method") == "initialize":
                self.headers["Mcp-Session-Id"] = "test-sess-abc-123"
                return FakeResponse("test-sess-abc-123")
            return FakeResponse(None)

    monkeypatch.setattr(mcp_client.httpx, "AsyncClient", FakeAsyncClient)

    await mcp_client._list_tools_from_server("http://fake-mcp:8003")

    # Exactly one client was used for both calls (no per-request client churn)
    assert len(FakeAsyncClient.instances) == 1, (
        f"expected 1 httpx.AsyncClient instance shared across initialize+tools/list, "
        f"got {len(FakeAsyncClient.instances)} (regression: per-request client)"
    )

    # Both calls hit the same logical endpoint
    assert len(captured_calls) == 2, f"expected 2 POSTs, got {len(captured_calls)}"

    # The second call (tools/list) must carry the session id set during initialize
    second_call_headers = captured_calls[1]["headers"]
    assert second_call_headers.get("Mcp-Session-Id") == "test-sess-abc-123", (
        "tools/list must inherit Mcp-Session-Id from the initialize response — "
        "regression: session id was dropped between requests"
    )
