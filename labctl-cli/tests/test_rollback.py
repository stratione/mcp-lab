import json

from labctl_pkg import cli


def test_rollback_posts_expected_payload(lab_env, capsys):
    rc = cli.main(["rollback", "hello-app", "--env", "prod"])
    assert rc == 0
    req = next(r for r in lab_env.promotion.requests if r["path"] == "/rollback")
    assert json.loads(req["body"]) == {
        "image_name": "hello-app", "tag": "latest",
        "environment": "prod", "rolled_back_by": "labctl"}
    assert "rolled back hello-app:latest in prod" in capsys.readouterr().out


def test_rollback_with_tag_and_by(lab_env):
    rc = cli.main(["rollback", "hello-app:v1.0.0", "--env", "staging", "--by", "noe"])
    assert rc == 0
    body = json.loads(next(r for r in lab_env.promotion.requests
                           if r["path"] == "/rollback")["body"])
    assert body["tag"] == "v1.0.0"
    assert body["environment"] == "staging"
    assert body["rolled_back_by"] == "noe"


def test_rollback_nothing_to_roll_back(lab_env, capsys):
    lab_env.promotion.state["no_rollback_target"] = True
    rc = cli.main(["rollback", "hello-app", "--env", "prod"])
    err = capsys.readouterr().err
    assert rc == 1
    assert "No previous successful promotion" in err
