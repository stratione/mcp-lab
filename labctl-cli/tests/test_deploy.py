import json
import subprocess

from labctl_pkg import cli


def test_deploy_staging_full_command_construction(lab_env, fake_proc, capsys):
    rc = cli.main(["--engine", "docker", "deploy", "hello-app:latest", "--env", "staging"])
    assert rc == 0
    argvs = fake_proc.argvs()
    assert argvs[0] == ["docker", "pull", "localhost:5003/hello-app:latest"]
    assert argvs[1] == ["docker", "rm", "-f", "mcp-lab-app-staging"]
    assert argvs[2] == [
        "docker", "run", "-d",
        "--name", "mcp-lab-app-staging",
        "--network", "mcp-lab-net",
        "-p", "9081:8080",
        "--label", "mcp-lab.teardown=true",
        "--label", "mcp-lab.deployed=true",
        "--label", "mcp-lab.env=staging",
        "localhost:5003/hello-app:latest",
    ]
    assert "http://localhost:9081" in capsys.readouterr().out


def test_deploy_dev_and_prod_port_registry_mapping(lab_env, fake_proc):
    cli.main(["--engine", "docker", "deploy", "hello-app:v1.0.0", "--env", "dev"])
    run_argv = fake_proc.argvs()[2]
    assert "9080:8080" in run_argv
    assert run_argv[-1] == "localhost:5001/hello-app:v1.0.0"

    fake_proc.calls.clear()
    cli.main(["--engine", "docker", "deploy", "hello-app:v1.0.0", "--env", "prod"])
    run_argv = fake_proc.argvs()[2]
    assert "9082:8080" in run_argv
    assert run_argv[-1] == "localhost:5002/hello-app:v1.0.0"
    assert "mcp-lab-app-prod" in run_argv


def test_deploy_pull_failure_is_friendly(lab_env, fake_proc, capsys):
    fake_proc.add(lambda argv: argv[1] == "pull",
                  lambda argv: subprocess.CompletedProcess(
                      argv, 1, stdout="", stderr="manifest unknown"))
    rc = cli.main(["--engine", "docker", "deploy", "hello-app:latest", "--env", "dev"])
    err = capsys.readouterr().err
    assert rc == 1
    assert "could not pull" in err
    # we never even tried to run a container
    assert all(argv[1] != "run" for argv in fake_proc.argvs())


def test_undeploy(lab_env, fake_proc, capsys):
    rc = cli.main(["--engine", "docker", "undeploy", "dev"])
    assert rc == 0
    assert fake_proc.argvs() == [["docker", "rm", "-f", "mcp-lab-app-dev"]]
    assert "removed mcp-lab-app-dev" in capsys.readouterr().out


def test_applogs(lab_env, fake_proc):
    rc = cli.main(["--engine", "docker", "applogs", "prod"])
    assert rc == 0
    assert fake_proc.argvs() == [["docker", "logs", "--tail", "100", "mcp-lab-app-prod"]]
    assert fake_proc.calls[0]["stream"] is True


def test_deployments_parsing(lab_env, fake_proc, capsys):
    fake_proc.add(
        lambda argv: argv[1] == "ps",
        lambda argv: subprocess.CompletedProcess(
            argv, 0,
            stdout="mcp-lab-app-dev|localhost:5001/hello-app:latest|Up 3 minutes|0.0.0.0:9080->8080/tcp\n",
            stderr=""))
    rc = cli.main(["--engine", "docker", "deployments"])
    out = capsys.readouterr().out
    assert rc == 0
    assert fake_proc.argvs()[0] == [
        "docker", "ps", "--filter", "label=mcp-lab.deployed=true",
        "--format", "{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}"]
    assert "mcp-lab-app-dev" in out
    assert "http://localhost:9080" in out


def test_deployments_json(lab_env, fake_proc, capsys):
    fake_proc.add(
        lambda argv: argv[1] == "ps",
        lambda argv: subprocess.CompletedProcess(
            argv, 0, stdout="mcp-lab-app-prod|img|Up|0.0.0.0:9082->8080/tcp\n", stderr=""))
    rc = cli.main(["--engine", "docker", "--json", "deployments"])
    data = json.loads(capsys.readouterr().out)
    assert rc == 0
    assert data[0]["env"] == "prod"
    assert data[0]["url"] == "http://localhost:9082"
