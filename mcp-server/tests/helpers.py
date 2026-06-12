"""Shared test plumbing for the mcp-server suite.

Two things every tool test needs:
  1. `registered_tools(mcp)` — pull {name: fn} out of a FastMCP instance,
     tolerant of the registry attribute renames across FastMCP versions
     (same shim the older test files carry inline).
  2. A fake `httpx.AsyncClient` that records every request and answers from
     a scripted FIFO of responses — so client/tool code runs unmodified
     without any network.
"""

import json as _json

from mcp.server.fastmcp import FastMCP


def registered_tools(mcp: FastMCP) -> dict:
    """Return {name: tool_function} for tools registered on a FastMCP instance."""
    for attr in ("_tools", "_tool_handlers", "tools"):
        store = getattr(mcp, attr, None)
        if store is not None and hasattr(store, "items"):
            return dict(store.items())
    tm = getattr(mcp, "_tool_manager", None)
    if tm is not None:
        for attr in ("_tools", "tools"):
            inner = getattr(tm, attr, None)
            if inner is not None and hasattr(inner, "items"):
                # FastMCP wraps tools in a Tool object — pull the underlying fn
                return {
                    name: getattr(t, "fn", getattr(t, "func", t))
                    for name, t in inner.items()
                }
    raise AssertionError("Could not locate FastMCP tool registry")


class FakeResponse:
    """Minimal stand-in for httpx.Response (just what check_response needs)."""

    def __init__(self, payload, status_code: int = 200, headers: dict | None = None):
        self._payload = payload
        self.status_code = status_code
        self.headers = headers or {}
        self.text = _json.dumps(payload)

    def json(self):
        return self._payload


class HTTPRecorder:
    """Records requests made through the fake httpx.AsyncClient.

    calls:     list of dicts {method, url, **kwargs} in request order.
    responses: FIFO of FakeResponse objects; once drained, `default` is
               returned for any further request.
    """

    def __init__(self):
        self.calls: list[dict] = []
        self.responses: list[FakeResponse] = []
        self.default = FakeResponse({})

    def queue(self, payload, status_code: int = 200, headers: dict | None = None):
        self.responses.append(FakeResponse(payload, status_code, headers))

    def client_class(self):
        recorder = self

        class _FakeAsyncClient:
            def __init__(self, **kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, *exc):
                return False

            async def _request(self, method, url, **kwargs):
                recorder.calls.append({"method": method, "url": url, **kwargs})
                if recorder.responses:
                    return recorder.responses.pop(0)
                return recorder.default

            async def get(self, url, **kwargs):
                return await self._request("GET", url, **kwargs)

            async def post(self, url, **kwargs):
                return await self._request("POST", url, **kwargs)

            async def put(self, url, **kwargs):
                return await self._request("PUT", url, **kwargs)

            async def delete(self, url, **kwargs):
                return await self._request("DELETE", url, **kwargs)

        return _FakeAsyncClient
