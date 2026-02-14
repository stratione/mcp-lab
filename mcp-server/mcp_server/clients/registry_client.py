import httpx
from .. import config
from . import check_response


async def list_images(registry: str = "dev") -> list[str]:
    url = config.DEV_REGISTRY_URL if registry == "dev" else config.PROD_REGISTRY_URL
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{url}/v2/_catalog", timeout=10.0)
        check_response(resp)
        return resp.json().get("repositories", [])


async def list_tags(image_name: str, registry: str = "dev") -> list[str]:
    url = config.DEV_REGISTRY_URL if registry == "dev" else config.PROD_REGISTRY_URL
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{url}/v2/{image_name}/tags/list", timeout=10.0)
        check_response(resp)
        return resp.json().get("tags", [])


async def get_manifest(image_name: str, tag: str, registry: str = "dev") -> dict:
    url = config.DEV_REGISTRY_URL if registry == "dev" else config.PROD_REGISTRY_URL
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{url}/v2/{image_name}/manifests/{tag}",
            headers={
                "Accept": "application/vnd.docker.distribution.manifest.v2+json, "
                          "application/vnd.oci.image.manifest.v1+json"
            },
            timeout=10.0,
        )
        check_response(resp)
        return {
            "manifest": resp.json(),
            "digest": resp.headers.get("docker-content-digest", ""),
            "content_type": resp.headers.get("content-type", ""),
        }


async def tag_image(image_name: str, current_tag: str, new_tag: str, registry: str = "dev") -> bool:
    """Retag an existing image by putting its manifest under a new tag."""
    url = config.DEV_REGISTRY_URL if registry == "dev" else config.PROD_REGISTRY_URL
    
    # 1. Get the manifest of the current tag
    data = await get_manifest(image_name, current_tag, registry)
    manifest = data["manifest"]
    content_type = data["content_type"]

    # 2. Put the manifest under the new tag
    async with httpx.AsyncClient() as client:
        resp = await client.put(
            f"{url}/v2/{image_name}/manifests/{new_tag}",
            json=manifest,
            headers={"Content-Type": content_type},
            timeout=10.0,
        )
        check_response(resp)
        return True
