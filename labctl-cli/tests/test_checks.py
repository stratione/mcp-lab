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


def test_check_artifacts(lab_env, capsys):
    lab_env.registries["dev"].state["tags"]["hello-app"] = ["latest"]
    rc = cli.main(["check", "artifacts"])
    out = capsys.readouterr().out
    assert rc == 1
    assert "retag" in out

    lab_env.registries["dev"].state["tags"]["hello-app"] = ["latest", "v1.0.0"]
    rc = cli.main(["check", "artifacts"])
    assert rc == 0


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
