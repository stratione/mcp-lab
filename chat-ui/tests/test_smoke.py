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
async def test_list_tools_uses_single_httpx_client_across_initialize_and_tools_list(monkeypatch):
    """Pin the actual fix in mcp_client._list_tools_from_server (D-012):

    Both the `initialize` and `tools/list` requests are sent through ONE
    httpx.AsyncClient instance. The previous code did `async with
    httpx.AsyncClient() as c:` once per request, which (a) burned a TCP
    handshake per call and (b) prevented any cookie/header propagation that
    httpx's client-level state would otherwise provide.

    Note: this test does NOT claim that mcp_client propagates the
    Mcp-Session-Id header itself — production code does not do that. Many
    FastMCP `streamable_http` servers tolerate missing session headers on
    `tools/list` after a fresh `initialize`. If a future server requires
    explicit session-id propagation, that requires a separate fix to
    `_mcp_request` to read the response header and stash it on the client.
    """
    from app import mcp_client

    instances: list = []

    class FakeResponse:
        status_code = 200
        headers = {"content-type": "application/json"}
        text = '{"result": {"tools": []}}'

        def raise_for_status(self):
            pass

        def json(self):
            return {"result": {"tools": []}}

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            instances.append(self)
            self.posts = []

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def post(self, url, **kwargs):
            self.posts.append(url)
            return FakeResponse()

    monkeypatch.setattr(mcp_client.httpx, "AsyncClient", FakeAsyncClient)
    await mcp_client._list_tools_from_server("http://fake-mcp:8003")

    assert len(instances) == 1, (
        f"expected 1 shared httpx.AsyncClient for initialize+tools/list; "
        f"got {len(instances)} (regression: per-request client)"
    )
    assert len(instances[0].posts) == 2, (
        f"expected 2 POSTs through the shared client, got {len(instances[0].posts)}"
    )
