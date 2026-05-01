#!/usr/bin/env python3
"""Throwaway prototype — Q1 from plan_workshop_ready.md.

Confirms that the modern FastMCP API exposes a `Context` parameter that can
be added to a tool function to call `await ctx.info(...)` for progress logs.

Run:
    python3 scripts/_proto/test_fastmcp_context.py

PASS = the script prints "PASS — ..." lines and exits 0.
FAIL = exception or assertion error.
"""

import asyncio
import inspect
import sys

from mcp.server.fastmcp import FastMCP, Context


def main() -> int:
    mcp = FastMCP("proto")

    @mcp.tool()
    async def echo(msg: str, ctx: Context = None) -> str:
        # We can't fully exercise ctx.info here (it needs an active request
        # context from the transport), but we DO confirm:
        #   1. Context import works.
        #   2. The decorator accepts a Context-typed parameter without error.
        #   3. Context.info exists as a coroutine method.
        return f"echo:{msg}"

    # 1. Context import worked (we got here).
    print("PASS — Context imported from mcp.server.fastmcp")

    # 2. Tool registered cleanly with the Context parameter present.
    sig = inspect.signature(echo)
    assert "ctx" in sig.parameters, "ctx parameter not in echo signature"
    ctx_param = sig.parameters["ctx"]
    assert ctx_param.annotation is Context, (
        f"ctx annotation expected Context, got {ctx_param.annotation}"
    )
    assert ctx_param.default is None, (
        f"ctx default expected None, got {ctx_param.default}"
    )
    print("PASS — tool decorator accepted Context parameter (annotation + default)")

    # 3. Context has the methods we'll call from runner_tools.
    for method in ("info", "warning", "error", "debug", "report_progress"):
        assert hasattr(Context, method), f"Context.{method} missing"
        attr = getattr(Context, method)
        assert callable(attr), f"Context.{method} not callable"
    print("PASS — Context.info / .warning / .error / .debug / .report_progress all callable")

    # 4. Sanity: a separately registered tool that omits ctx still works.
    @mcp.tool()
    async def add(a: int, b: int) -> int:
        return a + b

    print("PASS — tools without ctx can coexist with tools that take ctx")

    print()
    print("=" * 50)
    print("ALL CHECKS PASSED — runner_tools.py can use:")
    print("    async def build_image(..., ctx: Context = None) -> str:")
    print("        if ctx is not None:")
    print('            await ctx.info("…")')
    print("=" * 50)
    return 0


if __name__ == "__main__":
    sys.exit(main())
