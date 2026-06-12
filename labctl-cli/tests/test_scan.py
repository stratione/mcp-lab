import json
import subprocess

from labctl_pkg import cli

TRIVY_REPORT = json.dumps({
    "SchemaVersion": 2,
    "ArtifactName": "registry-dev:5000/hello-app:latest",
    "Results": [
        {"Target": "registry-dev:5000/hello-app:latest (debian 12)",
         "Vulnerabilities": [
             {"VulnerabilityID": "CVE-2024-0001", "Severity": "CRITICAL"},
             {"VulnerabilityID": "CVE-2024-0002", "Severity": "HIGH"},
             {"VulnerabilityID": "CVE-2024-0003", "Severity": "HIGH"},
             {"VulnerabilityID": "CVE-2024-0004", "Severity": "MEDIUM"},
             {"VulnerabilityID": "CVE-2024-0005", "Severity": "LOW"},
             {"VulnerabilityID": "CVE-2024-0006", "Severity": "UNKNOWN"},
         ]},
        {"Target": "app/requirements.txt", "Vulnerabilities": None},
    ],
})

CLEAN_REPORT = json.dumps({"SchemaVersion": 2, "Results": []})

EXPECTED_TRIVY_ARGV = [
    "docker", "run", "--rm", "--network", "mcp-lab-net",
    "aquasec/trivy:latest", "image",
    "--server", "http://trivy:8080",
    "--format", "json", "--insecure",
    "registry-dev:5000/hello-app:latest",
]


def _trivy_handler(report):
    return (lambda argv: "aquasec/trivy:latest" in argv,
            lambda argv: subprocess.CompletedProcess(argv, 0, stdout=report, stderr=""))


def test_scan_runs_exact_trivy_command_and_posts_record(lab_env, fake_proc, capsys):
    fake_proc.add(*_trivy_handler(TRIVY_REPORT))
    rc = cli.main(["--engine", "docker", "scan", "hello-app:latest"])
    assert fake_proc.argvs()[0] == EXPECTED_TRIVY_ARGV

    post = next(r for r in lab_env.promotion.requests
                if r["method"] == "POST" and r["path"] == "/scans")
    payload = json.loads(post["body"])
    assert payload["image_name"] == "hello-app"
    assert payload["tag"] == "latest"
    assert payload["registry"] == "dev"
    assert payload["scanned_by"] == "labctl"
    assert payload["critical"] == 1
    assert payload["high"] == 2
    assert payload["medium"] == 1
    assert payload["low"] == 1
    assert payload["total"] == 6
    assert json.loads(payload["report"])["SchemaVersion"] == 2

    out = capsys.readouterr().out
    assert "FAIL" in out
    assert rc == 1  # gate failed: critical > 0


def test_scan_pass_gate(lab_env, fake_proc, capsys):
    fake_proc.add(*_trivy_handler(CLEAN_REPORT))
    rc = cli.main(["--engine", "docker", "scan", "hello-app:latest"])
    assert rc == 0
    assert "PASS" in capsys.readouterr().out


def test_scan_staging_registry_target(lab_env, fake_proc):
    fake_proc.add(*_trivy_handler(CLEAN_REPORT))
    cli.main(["--engine", "docker", "scan", "hello-app:v1.0.0", "-r", "staging"])
    assert fake_proc.argvs()[0][-1] == "registry-staging:5000/hello-app:v1.0.0"


def test_scan_trivy_failure_mentions_security_profile(lab_env, fake_proc, capsys):
    fake_proc.add(lambda argv: "aquasec/trivy:latest" in argv,
                  lambda argv: subprocess.CompletedProcess(
                      argv, 1, stdout="", stderr="failed to connect to trivy server"))
    rc = cli.main(["--engine", "docker", "scan", "hello-app:latest"])
    err = capsys.readouterr().err
    assert rc == 1
    assert "--profile security" in err
    assert "trivy" in err


def test_scans_list_and_report(lab_env, fake_proc, capsys):
    fake_proc.add(*_trivy_handler(TRIVY_REPORT))
    cli.main(["--engine", "docker", "scan", "hello-app:latest"])
    capsys.readouterr()

    rc = cli.main(["scans"])
    out = capsys.readouterr().out
    assert rc == 0
    assert "hello-app:latest" in out and "FAIL" in out

    rc = cli.main(["--json", "scan-report", "1"])
    data = json.loads(capsys.readouterr().out)
    assert rc == 0
    assert data["id"] == 1
    assert json.loads(data["report"])["ArtifactName"].endswith("hello-app:latest")
