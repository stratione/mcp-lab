"""Milestone 1 — gating delete_all_users behind USER_DESTRUCTIVE_TOOLS_ENABLED.

Workshop motivation: an LLM with `delete_all_users` exposed will, when prompted
with "wipe the seed data" or even ambiguous phrasing, happily nuke alice/bob/
charlie/diana/eve/system. That is a between-session foot-gun. The tool stays
in the codebase (D-002) as a discussion artifact but is hidden from the LLM
unless USER_DESTRUCTIVE_TOOLS_ENABLED=true.
"""

import importlib
import pytest
from mcp.server.fastmcp import FastMCP


def _registered_tool_names(mcp: FastMCP) -> set[str]:
    """Best-effort list of tool names from a FastMCP instance.

    FastMCP's internal registry name has changed across versions; we try a
    couple of attributes.
    """
    for attr in ("_tools", "_tool_handlers", "tools"):
        store = getattr(mcp, attr, None)
        if store is not None and hasattr(store, "keys"):
            return set(store.keys())
    # Fallback: try the registered tool manager
    tm = getattr(mcp, "_tool_manager", None)
    if tm is not None:
        for attr in ("_tools", "tools"):
            inner = getattr(tm, attr, None)
            if inner is not None and hasattr(inner, "keys"):
                return set(inner.keys())
    raise AssertionError(
        "Could not locate FastMCP tool registry; update _registered_tool_names()"
    )


def _fresh_register(monkeypatch, env_value: str | None) -> set[str]:
    """Reload config + user_tools with the env var set as requested,
    then call register() on a fresh FastMCP and return the tool names."""
    if env_value is None:
        monkeypatch.delenv("USER_DESTRUCTIVE_TOOLS_ENABLED", raising=False)
    else:
        monkeypatch.setenv("USER_DESTRUCTIVE_TOOLS_ENABLED", env_value)

    from mcp_server import config  # noqa: WPS433
    from mcp_server.tools import user_tools  # noqa: WPS433

    importlib.reload(config)
    importlib.reload(user_tools)

    mcp = FastMCP("test-user-tools")
    user_tools.register(mcp)
    return _registered_tool_names(mcp)


def test_delete_all_users_hidden_when_env_unset(monkeypatch):
    names = _fresh_register(monkeypatch, env_value=None)
    assert "list_users" in names, (
        "sanity check failed — list_users should always be registered"
    )
    assert "delete_all_users" not in names, (
        "delete_all_users must be hidden when USER_DESTRUCTIVE_TOOLS_ENABLED is unset"
    )


def test_delete_all_users_hidden_when_env_false(monkeypatch):
    names = _fresh_register(monkeypatch, env_value="false")
    assert "delete_all_users" not in names


def test_delete_all_users_exposed_when_env_true(monkeypatch):
    names = _fresh_register(monkeypatch, env_value="true")
    assert "delete_all_users" in names, (
        "delete_all_users should be registered when USER_DESTRUCTIVE_TOOLS_ENABLED=true"
    )


def test_delete_all_users_exposed_when_env_one(monkeypatch):
    """`_bool_env` accepts 'true', '1', 'yes' — confirm '1' also exposes."""
    names = _fresh_register(monkeypatch, env_value="1")
    assert "delete_all_users" in names
