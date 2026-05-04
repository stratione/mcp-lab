"""Integration test: README per-server tool counts must match the live lab.

Marked `integration` because it requires a running lab. Run with:

    make test-integration

Guards against the documentation drift the user explicitly flagged in the
walkthrough — the workshop attendees will copy commands from the README
verbatim and complain if "+9 tools" turns out to be 8.
"""

import re
import pytest
import httpx


CHAT_UI_URL = "http://localhost:3001"

# Workshop default: USER_DESTRUCTIVE_TOOLS_ENABLED is unset, which hides
# `delete_all_users` only. `delete_user` is always exposed, so mcp-user
# ships 9 tools (list_roles, list_users, get_user, get_user_by_username,
# create_user, update_user, deactivate_user, activate_user, delete_user).
EXPECTED_PER_SERVER = {
    "user": 9,
    "gitea": 7,
    "registry": 5,
    "promotion": 3,
    "runner": 3,
}


def _live_counts() -> dict[str, int]:
    try:
        r = httpx.get(f"{CHAT_UI_URL}/api/mcp-status", timeout=5)
    except Exception as e:
        pytest.skip(f"Lab not reachable ({e}); skipping integration test")
    if r.status_code != 200:
        pytest.skip(f"/api/mcp-status returned {r.status_code}; skipping")
    data = r.json()
    return {s["name"]: s.get("tool_count", 0) for s in data.get("servers", [])}


@pytest.mark.integration
def test_per_server_tool_counts_match_expected():
    counts = _live_counts()
    missing = [s for s in EXPECTED_PER_SERVER if s not in counts]
    assert not missing, f"server(s) missing from /api/mcp-status: {missing}"
    mismatches = {
        name: (counts[name], expected)
        for name, expected in EXPECTED_PER_SERVER.items()
        if counts[name] != expected
    }
    # Skip (don't fail) for OFFLINE servers — the lab may not have all 5 up.
    online_only = {
        name: vs for name, vs in mismatches.items() if vs[0] != 0
    }
    assert not online_only, (
        f"per-server tool counts disagree (live, expected): {online_only}. "
        "Either the README needs an update or a tool was added/removed."
    )


@pytest.mark.integration
def test_readme_mcp_tools_reference_table_matches_expected():
    """Parse the README's `## MCP Tools Reference` table and confirm
    the per-server counts match what we just asserted live."""
    with open("/Users/noelorona/Desktop/repos/mcp-lab/README.md") as f:
        readme = f.read()

    # Find the table after "## MCP Tools Reference"
    section = readme.split("## MCP Tools Reference", 1)
    assert len(section) == 2, "README missing '## MCP Tools Reference' section"
    table_block = section[1].split("##", 1)[0]

    # Each row looks like: "| **Whatever** | `mcp-user` | 8003 | 8 | ..."
    pattern = re.compile(
        r"\|\s*\*?\*?[^|]*\*?\*?\s*\|\s*`?mcp-(\w+)`?\s*\|\s*\d+\s*\|\s*(\d+)\s*\|"
    )
    found: dict[str, int] = {}
    for m in pattern.finditer(table_block):
        found[m.group(1)] = int(m.group(2))

    for name, expected in EXPECTED_PER_SERVER.items():
        assert name in found, (
            f"mcp-{name} row missing from README MCP Tools Reference table"
        )
        assert found[name] == expected, (
            f"README says mcp-{name} has {found[name]} tools, expected {expected}"
        )
