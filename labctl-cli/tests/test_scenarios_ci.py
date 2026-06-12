import json

from labctl_pkg import cli, scenarios


def _contents_requests(lab_env, method, path_suffix):
    return [r for r in lab_env.gitea.requests
            if r["method"] == method and r["path"].endswith("/contents/" + path_suffix)]


def test_break_creates_file_then_fix_updates_with_sha(lab_env, capsys):
    rc = cli.main(["break", "dockerfile-typo"])
    assert rc == 0
    files = lab_env.gitea.state["files"]
    assert "FROM pythn:3.12-alpine" in files["Dockerfile"]["content"]
    assert len(_contents_requests(lab_env, "POST", "Dockerfile")) == 1
    sha_after_create = files["Dockerfile"]["sha"]

    rc = cli.main(["fix", "dockerfile-typo"])
    assert rc == 0
    assert files["Dockerfile"]["content"].startswith("FROM python:3.12-alpine")
    puts = _contents_requests(lab_env, "PUT", "Dockerfile")
    assert len(puts) == 1
    assert json.loads(puts[0]["body"])["sha"] == sha_after_create  # sha-aware update


def test_break_is_idempotent(lab_env, capsys):
    cli.main(["break", "failing-test"])
    capsys.readouterr()
    rc = cli.main(["break", "failing-test"])
    out = capsys.readouterr().out
    assert rc == 0
    assert "unchanged" in out
    # exactly one write happened despite two invocations
    writes = (_contents_requests(lab_env, "POST", "test_app.py")
              + _contents_requests(lab_env, "PUT", "test_app.py"))
    assert len(writes) == 1


def test_vulnerable_base_scenario(lab_env):
    cli.main(["break", "vulnerable-base"])
    files = lab_env.gitea.state["files"]
    assert "FROM python:3.8-slim" in files["Dockerfile"]["content"]
    cli.main(["fix", "vulnerable-base"])
    assert files["Dockerfile"]["content"] == scenarios.CANONICAL_DOCKERFILE


def test_failing_test_fix_restores_passing_test(lab_env):
    cli.main(["break", "failing-test"])
    cli.main(["fix", "failing-test"])
    content = lab_env.gitea.state["files"]["test_app.py"]["content"]
    assert "9.9.9" not in content
    assert "import app" in content


def test_scenarios_listing(lab_env, capsys):
    rc = cli.main(["scenarios"])
    out = capsys.readouterr().out
    assert rc == 0
    for name in ("dockerfile-typo", "failing-test", "vulnerable-base"):
        assert name in out


def test_ci_init_creates_canonical_workflow(lab_env, capsys):
    rc = cli.main(["ci", "init"])
    assert rc == 0
    content = lab_env.gitea.state["files"][".gitea/workflows/ci.yml"]["content"]
    assert content.startswith("name: CI")
    assert "on: [push]" in content
    assert "docker build -t hello-app:" in content
    assert "skopeo copy --dest-tls-verify=false docker-daemon:hello-app:latest "\
           "docker://registry-dev:5000/hello-app:latest" in content
    assert "python3 -m pytest -q" in content


def test_ci_init_update_path_uses_existing_sha(lab_env):
    lab_env.gitea.state["files"][".gitea/workflows/ci.yml"] = {
        "sha": "old-sha", "content": "name: stale\n"}
    rc = cli.main(["ci", "init"])
    assert rc == 0
    put = next(r for r in lab_env.gitea.requests
               if r["method"] == "PUT" and r["path"].endswith("ci.yml"))
    assert json.loads(put["body"])["sha"] == "old-sha"
    assert lab_env.gitea.state["files"][".gitea/workflows/ci.yml"]["content"] == scenarios.CI_WORKFLOW
