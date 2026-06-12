import json

from labctl_pkg import cli
from .conftest import seed_dev_image


def test_verbose_echoes_raw_curl(lab_env, capsys):
    seed_dev_image(lab_env)
    rc = cli.main(["-v", "images"])
    captured = capsys.readouterr()
    assert rc == 0
    assert "→ raw: curl -s " in captured.err
    assert "/v2/_catalog" in captured.err
    assert "→ raw:" not in captured.out  # raw echo goes to stderr only


def test_no_verbose_no_raw_lines(lab_env, capsys):
    seed_dev_image(lab_env)
    cli.main(["images"])
    captured = capsys.readouterr()
    assert "→ raw:" not in captured.err + captured.out


def test_verbose_echoes_raw_engine_command(lab_env, fake_proc, capsys):
    cli.main(["--engine", "docker", "-v", "undeploy", "dev"])
    err = capsys.readouterr().err
    assert "→ raw: docker rm -f mcp-lab-app-dev" in err


def test_verbose_post_shows_json_body(lab_env, capsys):
    cli.main(["-v", "promote", "hello-app:latest", "--to", "staging"])
    err = capsys.readouterr().err
    assert "curl -s -X POST" in err
    assert '"image_name": "hello-app"' in err
    assert "/promote" in err


def test_verbose_never_prints_token(lab_env, capsys):
    (lab_env.root / ".env").write_text("GITEA_TOKEN=supersecret-token-123\n")
    rc = cli.main(["-v", "repos"])
    captured = capsys.readouterr()
    assert rc == 0
    assert "supersecret-token-123" not in captured.out + captured.err
    assert "Authorization: token $GITEA_TOKEN" in captured.err


def test_basic_auth_echoed_when_no_token(lab_env, capsys):
    cli.main(["-v", "repos"])
    err = capsys.readouterr().err
    assert "-u mcpadmin:mcpadmin123" in err  # lab-only creds, intentionally shown


def test_json_stdout_stays_clean_with_verbose(lab_env, capsys):
    seed_dev_image(lab_env)
    rc = cli.main(["-v", "--json", "images"])
    captured = capsys.readouterr()
    assert rc == 0
    data = json.loads(captured.out)  # must parse despite verbose mode
    assert data["repositories"] == ["hello-app"]
    assert "→ raw:" in captured.err


def test_global_flags_accepted_after_subcommand(lab_env, capsys):
    seed_dev_image(lab_env)
    rc = cli.main(["images", "--json"])
    assert rc == 0
    assert json.loads(capsys.readouterr().out)["registry"] == "dev"


def test_service_down_friendly_hint(monkeypatch, tmp_path, capsys):
    monkeypatch.setenv("LABCTL_REPO_ROOT", str(tmp_path))
    monkeypatch.setenv("LABCTL_PROMOTION_URL", "http://127.0.0.1:1")
    rc = cli.main(["promotions"])
    err = capsys.readouterr().err
    assert rc == 1
    assert "promotion-service is not up" in err
    assert "./labctl up" in err
