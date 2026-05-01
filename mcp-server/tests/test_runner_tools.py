"""Milestone 4B — runner_tools.py and deploy_tools.py must:
  1. Accept an optional `ctx: Context = None` parameter
  2. NOT crash with AttributeError when ctx is None
  3. Use the new pipeline (podman build → skopeo push, podman pull → podman run)
"""

import asyncio
import importlib
import inspect
import json

import pytest
from mcp.server.fastmcp import FastMCP, Context


def _registered_tools(mcp: FastMCP) -> dict:
    """Return {name: tool_function} for tools registered on a FastMCP instance.

    Same compatibility shim as the destructive_tools test.
    """
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


def _fresh_runner_tools():
    from mcp_server.tools import runner_tools
    importlib.reload(runner_tools)
    mcp = FastMCP("test-runner")
    runner_tools.register(mcp)
    return _registered_tools(mcp)


def _fresh_deploy_tools():
    from mcp_server.tools import deploy_tools
    importlib.reload(deploy_tools)
    mcp = FastMCP("test-deploy")
    deploy_tools.register(mcp)
    return _registered_tools(mcp)


# ─── signature contract tests ───

def test_build_image_signature_accepts_optional_ctx():
    tools = _fresh_runner_tools()
    assert "build_image" in tools
    sig = inspect.signature(tools["build_image"])
    assert "ctx" in sig.parameters, (
        f"build_image must accept a Context parameter; signature is {sig}"
    )
    assert sig.parameters["ctx"].default is None, (
        "ctx must default to None so direct callers can omit it"
    )


def test_scan_image_signature_accepts_optional_ctx():
    tools = _fresh_runner_tools()
    assert "scan_image" in tools
    sig = inspect.signature(tools["scan_image"])
    assert "ctx" in sig.parameters
    assert sig.parameters["ctx"].default is None


def test_deploy_app_signature_accepts_optional_ctx():
    tools = _fresh_deploy_tools()
    assert "deploy_app" in tools
    sig = inspect.signature(tools["deploy_app"])
    assert "ctx" in sig.parameters
    assert sig.parameters["ctx"].default is None


# ─── AttributeError fall-through tests (the bug from the walkthrough) ───

@pytest.mark.asyncio
async def test_build_image_does_not_raise_attribute_error_without_ctx(monkeypatch):
    """The original bug: `mcp.server.request_context.session.send_log_message`
    threw `'FastMCP' object has no attribute 'server'` immediately.

    After the fix, build_image with ctx=None must reach the subprocess step
    and report an error JSON (not a Python exception).
    """
    # Stub asyncio.create_subprocess_exec to fail fast at the git-clone step.
    class FakeProc:
        def __init__(self, returncode, stdout=b"", stderr=b""):
            self.returncode = returncode
            self._stdout = stdout
            self._stderr = stderr

        async def communicate(self):
            return self._stdout, self._stderr

        async def wait(self):
            return self.returncode

    async def fake_exec(*args, **kwargs):
        # Pretend git clone failed — that's a normal error path the tool
        # is expected to handle. Anything is fine as long as it's NOT an
        # AttributeError on the FastMCP context.
        return FakeProc(returncode=128, stderr=b"fatal: repository not found")

    monkeypatch.setattr(asyncio, "create_subprocess_exec", fake_exec)

    tools = _fresh_runner_tools()
    out = await tools["build_image"](
        repo_url="http://example.com/missing.git",
        image_name="x", tag="y",
    )
    parsed = json.loads(out)
    assert parsed["status"] == "error", (
        f"expected error JSON, got: {parsed}"
    )
    assert "FastMCP" not in str(parsed), (
        f"AttributeError on FastMCP leaked into the response: {parsed}"
    )


@pytest.mark.asyncio
async def test_deploy_app_does_not_raise_attribute_error_without_ctx(monkeypatch):
    class FakeProc:
        def __init__(self, returncode, stdout=b"", stderr=b""):
            self.returncode = returncode
            self._stdout = stdout
            self._stderr = stderr

        async def communicate(self):
            return self._stdout, self._stderr

        async def wait(self):
            return self.returncode

    async def fake_exec(*args, **kwargs):
        # Stub everything to succeed; we just want to confirm no
        # AttributeError on the FastMCP context plumbing.
        return FakeProc(returncode=0, stdout=b"deadbeef" + b"0" * 70)

    monkeypatch.setattr(asyncio, "create_subprocess_exec", fake_exec)

    tools = _fresh_deploy_tools()
    out = await tools["deploy_app"](image_name="x", tag="y", environment="prod")
    parsed = json.loads(out)
    # Whether the result is success or error doesn't matter — the regression
    # we're guarding against is `'FastMCP' object has no attribute 'server'`.
    assert "FastMCP" not in str(parsed), (
        f"AttributeError on FastMCP leaked into deploy_app response: {parsed}"
    )


@pytest.mark.asyncio
async def test_scan_image_returns_valid_json(monkeypatch):
    """scan_image is a pure mock; just confirm it runs without ctx and emits JSON."""
    tools = _fresh_runner_tools()
    out = await tools["scan_image"](image_name="sample-app", tag="v1.0.0")
    parsed = json.loads(out)
    assert parsed["status"] in ("PASSED", "FAILED")
    assert parsed["image"] == "sample-app:v1.0.0"
