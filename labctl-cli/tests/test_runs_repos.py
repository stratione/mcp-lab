import json

from labctl_pkg import cli


def _run(run_id, status, sha="abc1234def", title="Add feature"):
    return {"id": run_id, "status": status, "event": "push", "head_sha": sha,
            "display_title": title, "created_at": "2026-06-12T00:00:00Z"}


def test_repos(lab_env, capsys):
    rc = cli.main(["repos"])
    out = capsys.readouterr().out
    assert rc == 0
    assert "mcpadmin/sample-app" in out


def test_repos_json(lab_env, capsys):
    rc = cli.main(["--json", "repos"])
    data = json.loads(capsys.readouterr().out)
    assert rc == 0
    assert data[0]["full_name"] == "mcpadmin/sample-app"


def test_runs_table(lab_env, capsys):
    lab_env.gitea.state["runs"] = [_run(1, "success"), _run(2, "failure")]
    rc = cli.main(["runs", "sample-app"])
    out = capsys.readouterr().out
    assert rc == 0
    assert "success" in out and "failure" in out and "abc1234" in out


def test_runs_no_runs_yet(lab_env, capsys):
    rc = cli.main(["runs", "sample-app"])
    out = capsys.readouterr().out
    assert rc == 0
    assert "no CI runs" in out


def test_runs_watch_prints_transitions_until_success(lab_env, capsys):
    lab_env.gitea.state["runs_sequence"] = [
        [_run(5, "waiting")],
        [_run(5, "running")],
        [_run(5, "running")],
        [_run(5, "success")],
    ]
    rc = cli.main(["runs", "sample-app", "--watch", "--interval", "0"])
    out = capsys.readouterr().out
    assert rc == 0
    assert "status: waiting" in out
    assert "status: running" in out
    assert "status: success" in out
    # transitions only — "running" must not be printed twice
    assert out.count("status: running") == 1


def test_runs_watch_failure_exit_code(lab_env, capsys):
    lab_env.gitea.state["runs_sequence"] = [
        [_run(7, "running")],
        [_run(7, "failure")],
    ]
    rc = cli.main(["runs", "sample-app", "--watch", "--interval", "0"])
    out = capsys.readouterr().out
    assert rc == 1
    assert "failure" in out
