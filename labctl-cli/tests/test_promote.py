import json

from labctl_pkg import cli


def _promote_request(lab_env):
    return json.loads(next(r for r in lab_env.promotion.requests
                           if r["method"] == "POST" and r["path"] == "/promote")["body"])


def test_promote_to_staging_derives_from_dev(lab_env, capsys):
    rc = cli.main(["promote", "hello-app:latest", "--to", "staging"])
    assert rc == 0
    body = _promote_request(lab_env)
    assert body == {"image_name": "hello-app", "tag": "latest", "promoted_by": "labctl",
                    "from_registry": "dev", "to_registry": "staging"}
    assert "dev → staging" in capsys.readouterr().out


def test_promote_to_prod_derives_from_staging(lab_env):
    rc = cli.main(["promote", "hello-app:v1.0.0", "--to", "prod", "--by", "noe"])
    assert rc == 0
    body = _promote_request(lab_env)
    assert body["from_registry"] == "staging"
    assert body["tag"] == "v1.0.0"
    assert body["promoted_by"] == "noe"


def test_promote_two_stage_policy(lab_env):
    lab_env.promotion.state["policy"] = {
        "flow": "two-stage", "require_scan": False, "max_critical": 0,
        "legal_promotions": [["dev", "prod"]]}
    rc = cli.main(["promote", "hello-app:latest", "--to", "prod"])
    assert rc == 0
    assert _promote_request(lab_env)["from_registry"] == "dev"


def test_promote_illegal_target_under_policy(lab_env, capsys):
    lab_env.promotion.state["policy"]["legal_promotions"] = [["dev", "staging"]]
    rc = cli.main(["promote", "hello-app:latest", "--to", "prod"])
    err = capsys.readouterr().err
    assert rc == 1
    assert "no legal promotion path to 'prod'" in err


def test_promote_blocked_by_policy_surfaces_detail(lab_env, capsys):
    lab_env.promotion.state["block"] = True
    rc = cli.main(["promote", "hello-app:latest", "--to", "staging"])
    err = capsys.readouterr().err
    assert rc == 1
    assert "blocked by policy: no passing scan for hello-app:latest in dev" in err


def test_promotions_table_and_json(lab_env, capsys):
    cli.main(["promote", "hello-app:latest", "--to", "staging"])
    capsys.readouterr()
    rc = cli.main(["promotions"])
    out = capsys.readouterr().out
    assert rc == 0
    assert "hello-app:latest" in out and "promote" in out

    rc = cli.main(["--json", "promotions"])
    data = json.loads(capsys.readouterr().out)
    assert rc == 0
    assert data[0]["action"] == "promote"


def test_policy_output(lab_env, capsys):
    rc = cli.main(["policy"])
    out = capsys.readouterr().out
    assert rc == 0
    assert "three-stage" in out and "dev → staging" in out

    rc = cli.main(["--json", "policy"])
    data = json.loads(capsys.readouterr().out)
    assert data["legal_promotions"] == [["dev", "staging"], ["staging", "prod"]]
