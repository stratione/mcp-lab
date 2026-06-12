"""Contract §3 — new gitea tools: gitea_list_action_runs, gitea_get_action_run,
gitea_create_tag. All HTTP is mocked (HTTPRecorder); no Gitea required.
"""

import base64
import json

import httpx
import pytest
from mcp.server.fastmcp import FastMCP

from tests.helpers import HTTPRecorder, registered_tools


SAMPLE_RUN = {
    "id": 7,
    "name": "CI",
    "display_title": "fix the dockerfile",
    "status": "success",
    "event": "push",
    "head_branch": "main",
    "head_sha": "abc123def4567890aaaa",
    "run_number": 3,
    "workflow_id": "ci.yml",
    "created_at": "2026-06-11T10:00:00Z",
    "updated_at": "2026-06-11T10:01:00Z",
    "url": "/mcpadmin/sample-app/actions/runs/7",
}


@pytest.fixture
def fake_httpx(monkeypatch):
    rec = HTTPRecorder()
    monkeypatch.setattr(httpx, "AsyncClient", rec.client_class())
    return rec


@pytest.fixture
def gitea_tools_registry():
    from mcp_server.tools import gitea_tools
    mcp = FastMCP("test-gitea")
    gitea_tools.register(mcp)
    return registered_tools(mcp)


# ─── gitea_list_action_runs ───

async def test_list_action_runs_hits_tasks_endpoint(fake_httpx, gitea_tools_registry):
    fake_httpx.queue({"total_count": 1, "workflow_runs": [SAMPLE_RUN]})
    out = await gitea_tools_registry["gitea_list_action_runs"]("mcpadmin", "sample-app")

    call = fake_httpx.calls[0]
    assert call["method"] == "GET"
    assert call["url"].endswith("/api/v1/repos/mcpadmin/sample-app/actions/tasks")

    parsed = json.loads(out)
    assert parsed["total_count"] == 1
    assert parsed["runs"][0]["id"] == 7
    assert parsed["runs"][0]["status"] == "success"
    assert parsed["runs"][0]["head_sha"] == "abc123def456"  # truncated to 12


async def test_list_action_runs_parses_bare_list_shape(fake_httpx, gitea_tools_registry):
    """Some Gitea versions return a bare list rather than an envelope dict."""
    fake_httpx.queue([SAMPLE_RUN, {**SAMPLE_RUN, "id": 8, "status": "failure"}])
    out = await gitea_tools_registry["gitea_list_action_runs"]("mcpadmin", "sample-app")
    parsed = json.loads(out)
    assert parsed["total_count"] == 2
    assert [r["id"] for r in parsed["runs"]] == [7, 8]


async def test_list_action_runs_per_call_auth(fake_httpx, gitea_tools_registry):
    """username+password must flow through as HTTP Basic, like every gitea tool."""
    fake_httpx.queue({"total_count": 0, "workflow_runs": []})
    await gitea_tools_registry["gitea_list_action_runs"](
        "mcpadmin", "sample-app", username="diana", password="secret"
    )
    headers = fake_httpx.calls[0]["headers"]
    expected = "Basic " + base64.b64encode(b"diana:secret").decode()
    assert headers.get("Authorization") == expected


# ─── gitea_get_action_run ───

async def test_get_action_run_filters_by_run_id_and_hints_logs(fake_httpx, gitea_tools_registry):
    fake_httpx.queue({"total_count": 2, "workflow_runs": [
        SAMPLE_RUN, {**SAMPLE_RUN, "id": 8, "status": "running"},
    ]})
    out = await gitea_tools_registry["gitea_get_action_run"]("mcpadmin", "sample-app", 8)
    parsed = json.loads(out)
    assert parsed["run"]["id"] == 8
    assert parsed["run"]["status"] == "running"
    assert "not exposed by this Gitea version" in parsed["logs_hint"]
    assert "docker compose logs act-runner" in parsed["logs_hint"]


async def test_get_action_run_unknown_id_lists_available(fake_httpx, gitea_tools_registry):
    fake_httpx.queue({"total_count": 1, "workflow_runs": [SAMPLE_RUN]})
    out = await gitea_tools_registry["gitea_get_action_run"]("mcpadmin", "sample-app", 999)
    parsed = json.loads(out)
    assert "error" in parsed
    assert parsed["available_run_ids"] == [7]
    assert "docker compose logs act-runner" in parsed["logs_hint"]


# ─── gitea_create_tag ───

async def test_create_tag_posts_to_tags_endpoint(fake_httpx, gitea_tools_registry):
    fake_httpx.queue(
        {"name": "v1.0.0", "message": "release", "commit": {"sha": "abc123def4567890"}},
        status_code=201,
    )
    out = await gitea_tools_registry["gitea_create_tag"](
        "mcpadmin", "sample-app", "v1.0.0", target="main", message="release"
    )
    call = fake_httpx.calls[0]
    assert call["method"] == "POST"
    assert call["url"].endswith("/api/v1/repos/mcpadmin/sample-app/tags")
    assert call["json"] == {"tag_name": "v1.0.0", "target": "main", "message": "release"}

    parsed = json.loads(out)
    assert parsed["tag"] == "v1.0.0"
    assert parsed["commit"] == "abc123def456"


async def test_create_tag_per_call_auth(fake_httpx, gitea_tools_registry):
    fake_httpx.queue({"name": "v2", "commit": {"sha": "ff"}}, status_code=201)
    await gitea_tools_registry["gitea_create_tag"](
        "mcpadmin", "sample-app", "v2", username="bob", password="pw123"
    )
    headers = fake_httpx.calls[0]["headers"]
    expected = "Basic " + base64.b64encode(b"bob:pw123").decode()
    assert headers.get("Authorization") == expected
