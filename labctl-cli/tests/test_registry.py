import json

from labctl_pkg import cli, registry
from .conftest import seed_dev_image


def test_images_lists_catalog(lab_env, capsys):
    seed_dev_image(lab_env)
    rc = cli.main(["images"])
    assert rc == 0
    assert "hello-app" in capsys.readouterr().out


def test_images_json(lab_env, capsys):
    seed_dev_image(lab_env)
    rc = cli.main(["--json", "images"])
    assert rc == 0
    data = json.loads(capsys.readouterr().out)
    assert data == {"registry": "dev", "repositories": ["hello-app"]}


def test_tags(lab_env, capsys):
    seed_dev_image(lab_env)
    rc = cli.main(["tags", "hello-app"])
    out = capsys.readouterr().out
    assert rc == 0
    assert "latest" in out and "v1.0.0" in out


def test_tags_json(lab_env, capsys):
    seed_dev_image(lab_env)
    rc = cli.main(["--json", "tags", "hello-app"])
    data = json.loads(capsys.readouterr().out)
    assert rc == 0
    assert data["tags"] == ["latest", "v1.0.0"]


def test_tags_missing_image_is_friendly(lab_env, capsys):
    rc = cli.main(["tags", "nope"])
    err = capsys.readouterr().err
    assert rc == 1
    assert "not found" in err and "labctl images" in err


def test_retag_reputs_manifest_with_same_type_and_bytes(lab_env, capsys):
    manifest = b'{"schemaVersion":2,"layers":[]}'
    seed_dev_image(lab_env, ctype="application/vnd.docker.distribution.manifest.v2+json",
                   manifest=manifest)
    rc = cli.main(["retag", "hello-app:latest", "v2.0.0"])
    assert rc == 0
    dev = lab_env.registries["dev"]
    ctype, body = dev.state["manifests"][("hello-app", "v2.0.0")]
    assert ctype == "application/vnd.docker.distribution.manifest.v2+json"
    assert body == manifest

    get_req = next(r for r in dev.requests
                   if r["method"] == "GET" and "/manifests/latest" in r["path"])
    accept = get_req["headers"].get("Accept", "")
    for media_type in (
        "application/vnd.docker.distribution.manifest.v2+json",
        "application/vnd.docker.distribution.manifest.list.v2+json",
        "application/vnd.oci.image.manifest.v1+json",
        "application/vnd.oci.image.index.v1+json",
    ):
        assert media_type in accept

    put_req = next(r for r in dev.requests
                   if r["method"] == "PUT" and "/manifests/v2.0.0" in r["path"])
    assert put_req["headers"]["Content-Type"] == "application/vnd.docker.distribution.manifest.v2+json"
    assert put_req["body"] == manifest
    assert "retagged hello-app:latest" in capsys.readouterr().out


def test_retag_works_for_manifest_lists(lab_env):
    index = b'{"schemaVersion":2,"manifests":[]}'
    seed_dev_image(lab_env, ctype="application/vnd.oci.image.index.v1+json", manifest=index)
    rc = cli.main(["retag", "hello-app:latest", "multi"])
    assert rc == 0
    ctype, body = lab_env.registries["dev"].state["manifests"][("hello-app", "multi")]
    assert ctype == "application/vnd.oci.image.index.v1+json"
    assert body == index


def test_registry_down_hint(lab_env, monkeypatch, capsys):
    monkeypatch.setenv("LABCTL_REGISTRY_DEV_URL", "http://127.0.0.1:1")
    rc = cli.main(["images"])
    err = capsys.readouterr().err
    assert rc == 1
    assert "registry-dev is not up" in err
    assert "./labctl up" in err
