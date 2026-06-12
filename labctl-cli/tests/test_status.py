import json

from labctl_pkg import cli


def test_status_probes_services(lab_env, fake_proc, capsys):
    rc = cli.main(["--engine", "docker", "status"])
    out = capsys.readouterr().out
    assert rc == 0
    gitea_line = next(l for l in out.splitlines() if l.startswith("gitea"))
    assert "up" in gitea_line
    promo_line = next(l for l in out.splitlines() if l.startswith("promotion-service"))
    assert "up" in promo_line
    # chat-ui is optional and not faked → down, but no crash
    chat_line = next(l for l in out.splitlines() if l.startswith("chat-ui"))
    assert "down" in chat_line and "optional" in chat_line
    # engine ps went through the subprocess helper
    assert ["docker", "ps", "--format", "{{.Names}}|{{.Status}}"] in fake_proc.argvs()


def test_status_json(lab_env, fake_proc, capsys):
    rc = cli.main(["--engine", "docker", "--json", "status"])
    assert rc == 0
    data = json.loads(capsys.readouterr().out)
    assert data["services"]["gitea"]["up"] is True
    assert data["services"]["registry-staging"]["up"] is True
    assert data["services"]["chat-ui"]["up"] is False
    assert data["services"]["chat-ui"]["optional"] is True


def test_status_shows_containers(lab_env, fake_proc, capsys):
    import subprocess
    fake_proc.add(lambda argv: argv[1] == "ps",
                  lambda argv: subprocess.CompletedProcess(
                      argv, 0, stdout="gitea|Up 2 hours\nregistry-dev|Up 2 hours\n", stderr=""))
    rc = cli.main(["--engine", "docker", "status"])
    out = capsys.readouterr().out
    assert rc == 0
    assert "Up 2 hours" in out
