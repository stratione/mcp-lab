import json

from labctl_pkg import cli


def _commit(sha):
    return {"sha": sha, "commit": {"message": "m"}}


def test_check_git_pass(lab_env, capsys):
    lab_env.gitea.state["commits"] = [_commit("a"), _commit("b")]
    rc = cli.main(["check", "1"])
    out = capsys.readouterr().out
    assert rc == 0
    assert "PASS" in out and "module 1 (git)" in out


def test_check_git_fail_with_hint(lab_env, capsys):
    lab_env.gitea.state["commits"] = [_commit("a")]
    rc = cli.main(["check", "git"])
    out = capsys.readouterr().out
    assert rc == 1
    assert "FAIL" in out
    assert "hint:" in out
    assert "commit" in out


def test_check_security_fail_then_pass(lab_env, capsys):
    rc = cli.main(["check", "security"])
    out = capsys.readouterr().out
    assert rc == 1
    assert "FAIL" in out and "labctl scan" in out

    lab_env.promotion.state["scans"] = [{
        "id": 1, "image_name": "hello-app", "tag": "latest", "registry": "dev",
        "scanned_by": "labctl", "critical": 0, "high": 1, "medium": 0, "low": 0,
        "total": 1, "passed": True, "report": "{}", "created_at": "now"}]
    rc = cli.main(["check", "4"])
    out = capsys.readouterr().out
    assert rc == 0
    assert "PASS" in out


def test_check_security_pins_to_latest_tag(lab_env, capsys):
    # A passing scan of some *other* tag must not satisfy module 4 — it pins to
    # hello-app:latest (the deployable artifact).
    lab_env.promotion.state["scans"] = [{
        "id": 1, "image_name": "hello-app", "tag": "throwaway", "registry": "dev",
        "scanned_by": "labctl", "critical": 0, "high": 0, "medium": 0, "low": 0,
        "total": 0, "passed": True, "report": "{}", "created_at": "now"}]
    rc = cli.main(["check", "4"])
    out = capsys.readouterr().out
    assert rc == 1
    assert "no scan recorded for hello-app:latest" in out


def test_check_artifacts(lab_env, capsys):
    lab_env.registries["dev"].state["tags"]["hello-app"] = ["latest"]
    rc = cli.main(["check", "artifacts"])
    out = capsys.readouterr().out
    assert rc == 1
    assert "retag" in out

    lab_env.registries["dev"].state["tags"]["hello-app"] = ["latest", "v1.0.0"]
    rc = cli.main(["check", "artifacts"])
    assert rc == 0


def test_check_artifacts_sha_tag_does_not_count(lab_env, capsys):
    # A CI-pushed 40-char hex SHA tag must NOT satisfy module 3 — that module
    # teaches a deliberate human retag, which CI never produces.
    lab_env.registries["dev"].state["tags"]["hello-app"] = ["latest", "a" * 40]
    rc = cli.main(["check", "artifacts"])
    out = capsys.readouterr().out
    assert rc == 1
    assert "retag" in out


def test_check_all_exit_code_counts_failures(lab_env, fake_proc, capsys):
    # empty lab: everything fails except nothing → expect several failures
    rc = cli.main(["--engine", "docker", "check", "all"])
    out = capsys.readouterr().out
    assert rc == out.count("FAIL")
    assert rc >= 5


def test_check_json_mode(lab_env, capsys):
    lab_env.gitea.state["commits"] = [_commit("a"), _commit("b")]
    rc = cli.main(["--json", "check", "1"])
    data = json.loads(capsys.readouterr().out)
    assert rc == 0
    assert data == [{"module": 1, "name": "git", "passed": True,
                     "detail": data[0]["detail"], "hint": ""}]


def test_check_unknown_module(lab_env, capsys):
    rc = cli.main(["check", "nope"])
    err = capsys.readouterr().err
    assert rc == 1
    assert "unknown module" in err


def test_modules_lists_all_seven_without_lab(capsys, monkeypatch, tmp_path):
    # no fakes, no lab — must still work (static output)
    monkeypatch.setenv("LABCTL_REPO_ROOT", str(tmp_path))
    rc = cli.main(["modules"])
    out = capsys.readouterr().out
    assert rc == 0
    for name in ("git", "ci", "artifacts", "security", "promotion", "deploy", "ops"):
        assert name in out


# ── module 8: build your own MCP tool ────────────────────────────────────────

from .conftest import FakeService


def _mcp_router(tools, sse=True):
    payload = {"jsonrpc": "2.0", "id": 1,
               "result": {"tools": [{"name": n} for n in tools]}}
    def router(method, record, state):
        if record["path"] == "/mcp" and method == "POST":
            if sse:
                body = "event: message\ndata: {}\n\n".format(json.dumps(payload)).encode()
                return 200, "text/event-stream", body, None
            return 200, "application/json", json.dumps(payload).encode(), None
        return 404, "application/json", b"{}", None
    return router


_STOCK = ["list_roles", "list_users", "get_user", "get_user_by_username",
          "create_user", "update_user", "deactivate_user", "activate_user",
          "delete_user"]


def test_check_byo_stock_only_fails(lab_env, monkeypatch, capsys):
    svc = FakeService(_mcp_router(_STOCK))
    monkeypatch.setenv("LABCTL_MCP_USER_URL", svc.url)
    try:
        rc = cli.main(["check", "8"])
    finally:
        svc.stop()
    out = capsys.readouterr().out
    assert rc == 1
    assert "stock tools" in out
    assert "custom_tools.py" in out  # the hint names the workspace file


def test_check_byo_learner_tool_passes(lab_env, monkeypatch, capsys):
    svc = FakeService(_mcp_router(_STOCK + ["pipeline_health"]))
    monkeypatch.setenv("LABCTL_MCP_USER_URL", svc.url)
    try:
        rc = cli.main(["check", "byo"])
    finally:
        svc.stop()
    out = capsys.readouterr().out
    assert rc == 0
    assert "pipeline_health" in out


def test_check_byo_parses_bare_json_reply(lab_env, monkeypatch, capsys):
    svc = FakeService(_mcp_router(_STOCK + ["my_tool"], sse=False))
    monkeypatch.setenv("LABCTL_MCP_USER_URL", svc.url)
    try:
        rc = cli.main(["check", "8"])
    finally:
        svc.stop()
    assert rc == 0
    assert "my_tool" in capsys.readouterr().out


def test_check_byo_server_down(lab_env, monkeypatch, capsys):
    monkeypatch.setenv("LABCTL_MCP_USER_URL", "http://127.0.0.1:1")
    rc = cli.main(["check", "8"])
    out = capsys.readouterr().out
    assert rc == 1
    assert "not answering" in out


def test_check_deploy_health_url_template(lab_env, fake_proc, monkeypatch, capsys):
    # In-network callers (chat-ui backend) probe the app container directly
    # via LABCTL_APP_HEALTH_URL_TPL — regression pin for the unbound `port`
    # crash on this path.
    svc = FakeService(lambda m, r, s: (200, "application/json", b'{"status":"ok"}', None))
    monkeypatch.setenv("LABCTL_APP_HEALTH_URL_TPL", svc.url.rstrip("/") + "/{env}")
    fake_proc.add(lambda argv: "ps" in argv, lambda argv: __import__("subprocess").CompletedProcess(
        argv, 0, stdout="mcp-lab-app-prod\n", stderr=""))
    try:
        rc = cli.main(["--engine", "docker", "check", "6"])
    finally:
        svc.stop()
    out = capsys.readouterr().out
    assert rc == 0
    assert "mcp-lab-app-prod running and healthy at" in out
