"""copy_image / repoint_tag against a mocked Registry v2 API (respx)."""
import json

import httpx
import pytest
import respx

from app.promote import MANIFEST_ACCEPT, copy_image, repoint_tag

DEV = "http://registry-dev:5000"
PROD = "http://registry-prod:5000"


@pytest.fixture(autouse=True)
def clean_registry_env(monkeypatch):
    """These tests bypass lab_db, so clear ambient registry URL overrides."""
    for var in ("DEV_REGISTRY_URL", "STAGING_REGISTRY_URL", "PROD_REGISTRY_URL"):
        monkeypatch.delenv(var, raising=False)

MANIFEST = {
    "schemaVersion": 2,
    "mediaType": "application/vnd.docker.distribution.manifest.v2+json",
    "config": {"digest": "sha256:cfg"},
    "layers": [{"digest": "sha256:layer1"}, {"digest": "sha256:layer2"}],
}
MANIFEST_DIGEST = "sha256:feedface"


def mock_source_manifest(router, content_type=MANIFEST["mediaType"], body=None):
    return router.get(f"{DEV}/v2/hello-app/manifests/latest").mock(
        return_value=httpx.Response(
            200,
            content=json.dumps(body or MANIFEST).encode(),
            headers={"Content-Type": content_type, "Docker-Content-Digest": MANIFEST_DIGEST},
        )
    )


@respx.mock
async def test_copy_image_happy_path():
    get_manifest = mock_source_manifest(respx)
    for digest in ("sha256:cfg", "sha256:layer1", "sha256:layer2"):
        respx.get(f"{DEV}/v2/hello-app/blobs/{digest}").mock(
            return_value=httpx.Response(200, content=b"blobdata")
        )
    respx.post(f"{PROD}/v2/hello-app/blobs/uploads/").mock(
        return_value=httpx.Response(202, headers={"Location": "/v2/hello-app/blobs/uploads/uuid1"})
    )
    blob_put = respx.put(url__regex=rf"{PROD}/v2/hello-app/blobs/uploads/uuid1\?digest=.*").mock(
        return_value=httpx.Response(201)
    )
    manifest_put = respx.put(f"{PROD}/v2/hello-app/manifests/latest").mock(
        return_value=httpx.Response(201)
    )

    success, digest, msg = await copy_image("hello-app", "latest", "dev", "prod")
    assert (success, digest, msg) == (True, MANIFEST_DIGEST, "success")
    assert blob_put.call_count == 3
    # Accept covers single manifests AND manifest lists (docker + OCI flavors)
    accept = get_manifest.calls.last.request.headers["accept"]
    for media_type in (
        "application/vnd.docker.distribution.manifest.v2+json",
        "application/vnd.oci.image.manifest.v1+json",
        "application/vnd.docker.distribution.manifest.list.v2+json",
        "application/vnd.oci.image.index.v1+json",
    ):
        assert media_type in accept
    # Manifest re-pushed byte-for-byte with the original content type
    assert manifest_put.calls.last.request.headers["content-type"] == MANIFEST["mediaType"]
    assert json.loads(manifest_put.calls.last.request.content) == MANIFEST


@respx.mock
async def test_copy_image_manifest_list_has_no_blobs_to_copy():
    list_type = "application/vnd.docker.distribution.manifest.list.v2+json"
    body = {"schemaVersion": 2, "mediaType": list_type,
            "manifests": [{"digest": "sha256:childA"}, {"digest": "sha256:childB"}]}
    mock_source_manifest(respx, content_type=list_type, body=body)
    manifest_put = respx.put(f"{PROD}/v2/hello-app/manifests/latest").mock(
        return_value=httpx.Response(201)
    )

    success, digest, msg = await copy_image("hello-app", "latest", "dev", "prod")
    # Manifest lists have no config/layers — existing behavior pushes the list as-is.
    assert success is True
    assert manifest_put.calls.last.request.headers["content-type"] == list_type


@respx.mock
async def test_copy_image_404_in_source():
    respx.get(f"{DEV}/v2/hello-app/manifests/latest").mock(return_value=httpx.Response(404))
    success, digest, msg = await copy_image("hello-app", "latest", "dev", "prod")
    assert success is False
    assert msg == "Image hello-app:latest not found in dev registry"


@respx.mock
async def test_copy_image_source_unreachable():
    respx.get(f"{DEV}/v2/hello-app/manifests/latest").mock(side_effect=httpx.ConnectError("boom"))
    success, digest, msg = await copy_image("hello-app", "latest", "dev", "prod")
    assert success is False
    assert msg == "dev registry unreachable"


@respx.mock
async def test_copy_image_blob_already_exists_in_target():
    mock_source_manifest(respx, body={**MANIFEST, "layers": []})
    respx.get(f"{DEV}/v2/hello-app/blobs/sha256:cfg").mock(
        return_value=httpx.Response(200, content=b"cfg")
    )
    respx.post(f"{PROD}/v2/hello-app/blobs/uploads/").mock(
        return_value=httpx.Response(202, headers={"Location": "/v2/hello-app/blobs/uploads/u"})
    )
    # PUT rejected, but HEAD confirms the blob is already there → not an error.
    respx.put(url__regex=rf"{PROD}/v2/hello-app/blobs/uploads/u\?digest=.*").mock(
        return_value=httpx.Response(400)
    )
    respx.head(f"{PROD}/v2/hello-app/blobs/sha256:cfg").mock(return_value=httpx.Response(200))
    respx.put(f"{PROD}/v2/hello-app/manifests/latest").mock(return_value=httpx.Response(201))

    success, digest, msg = await copy_image("hello-app", "latest", "dev", "prod")
    assert success is True


@respx.mock
async def test_copy_image_uses_env_registry_urls(monkeypatch):
    monkeypatch.setenv("STAGING_REGISTRY_URL", "http://registry-staging:5000")
    mock_source_manifest(respx, body={"schemaVersion": 2})
    manifest_put = respx.put("http://registry-staging:5000/v2/hello-app/manifests/latest").mock(
        return_value=httpx.Response(201)
    )
    success, _, _ = await copy_image("hello-app", "latest", "dev", "staging")
    assert success is True
    assert manifest_put.called


@respx.mock
async def test_repoint_tag_happy_path():
    get_by_digest = respx.get(f"{PROD}/v2/hello-app/manifests/{MANIFEST_DIGEST}").mock(
        return_value=httpx.Response(
            200,
            content=json.dumps(MANIFEST).encode(),
            headers={"Content-Type": MANIFEST["mediaType"]},
        )
    )
    put_by_tag = respx.put(f"{PROD}/v2/hello-app/manifests/latest").mock(
        return_value=httpx.Response(201)
    )

    success, msg = await repoint_tag("hello-app", "latest", "prod", MANIFEST_DIGEST)
    assert (success, msg) == (True, "success")
    assert get_by_digest.calls.last.request.headers["accept"] == MANIFEST_ACCEPT
    assert put_by_tag.calls.last.request.headers["content-type"] == MANIFEST["mediaType"]
    assert json.loads(put_by_tag.calls.last.request.content) == MANIFEST


@respx.mock
async def test_repoint_tag_manifest_garbage_collected():
    respx.get(f"{PROD}/v2/hello-app/manifests/{MANIFEST_DIGEST}").mock(
        return_value=httpx.Response(404)
    )
    success, msg = await repoint_tag("hello-app", "latest", "prod", MANIFEST_DIGEST)
    assert success is False
    assert "no longer present" in msg


@respx.mock
async def test_repoint_tag_registry_unreachable():
    respx.get(f"{PROD}/v2/hello-app/manifests/{MANIFEST_DIGEST}").mock(
        side_effect=httpx.ConnectError("boom")
    )
    success, msg = await repoint_tag("hello-app", "latest", "prod", MANIFEST_DIGEST)
    assert success is False
    assert msg == "prod registry unreachable"
