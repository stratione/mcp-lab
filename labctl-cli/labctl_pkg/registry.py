"""Docker Registry v2 API client (catalog / tags / manifest get + re-PUT)."""

from . import http
from .errors import LabError

# Accept every manifest flavor: docker v2 + OCI, including manifest lists,
# so retag works for single-arch and multi-arch images alike.
MANIFEST_ACCEPT = ", ".join([
    "application/vnd.docker.distribution.manifest.v2+json",
    "application/vnd.docker.distribution.manifest.list.v2+json",
    "application/vnd.oci.image.manifest.v1+json",
    "application/vnd.oci.image.index.v1+json",
])


def _service(name):
    return "registry-{}".format(name)


def catalog(ctx, reg):
    url = ctx.cfg.registry_url(reg) + "/v2/_catalog"
    resp = http.request(ctx, "GET", url, service=_service(reg))
    if resp.status != 200:
        raise LabError("{} catalog failed (HTTP {}): {}".format(_service(reg), resp.status, resp.detail()))
    return resp.json().get("repositories") or []


def tags(ctx, reg, image):
    url = "{}/v2/{}/tags/list".format(ctx.cfg.registry_url(reg), image)
    resp = http.request(ctx, "GET", url, service=_service(reg))
    if resp.status == 404:
        raise LabError("image '{}' not found in the {} registry — see: ./labctl images -r {}".format(
            image, reg, reg))
    if resp.status != 200:
        raise LabError("{} tags failed (HTTP {}): {}".format(_service(reg), resp.status, resp.detail()))
    return resp.json().get("tags") or []


def get_manifest(ctx, reg, image, tag):
    """Returns (content_type, raw_manifest_bytes, digest)."""
    url = "{}/v2/{}/manifests/{}".format(ctx.cfg.registry_url(reg), image, tag)
    resp = http.request(ctx, "GET", url, headers={"Accept": MANIFEST_ACCEPT},
                        service=_service(reg))
    if resp.status == 404:
        raise LabError("{}:{} not found in the {} registry — see: ./labctl tags {} -r {}".format(
            image, tag, reg, image, reg))
    if resp.status != 200:
        raise LabError("{} manifest fetch failed (HTTP {}): {}".format(
            _service(reg), resp.status, resp.detail()))
    return resp.header("Content-Type"), resp.body, resp.header("Docker-Content-Digest")


def put_manifest(ctx, reg, image, tag, content_type, manifest_bytes):
    url = "{}/v2/{}/manifests/{}".format(ctx.cfg.registry_url(reg), image, tag)
    resp = http.request(ctx, "PUT", url, headers={"Content-Type": content_type},
                        data=manifest_bytes, service=_service(reg))
    if resp.status not in (200, 201):
        raise LabError("{} manifest PUT failed (HTTP {}): {}".format(
            _service(reg), resp.status, resp.detail()))
    return resp.header("Docker-Content-Digest")


def retag(ctx, reg, image, tag, new_tag):
    """Registry-native retag: GET the manifest, re-PUT it under the new tag.

    Same bytes, same Content-Type — the blobs are already in the registry,
    so this is instant and adds no storage.
    """
    content_type, manifest, _digest = get_manifest(ctx, reg, image, tag)
    return put_manifest(ctx, reg, image, new_tag, content_type, manifest)
