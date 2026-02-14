from mcp.server.fastmcp import FastMCP
from ..clients import registry_client


def register(mcp: FastMCP):
    @mcp.tool()
    async def list_registry_images(registry: str = "dev") -> str:
        """List all images in a container registry. Registry must be 'dev' or 'prod'. Returns image names as JSON array."""
        import json
        images = await registry_client.list_images(registry)
        return json.dumps({"registry": registry, "images": images}, indent=2)

    @mcp.tool()
    async def list_registries() -> str:
        """List available container registries. Returns 'dev' and 'prod'."""
        import json
        return json.dumps(["dev", "prod"], indent=2)

    @mcp.tool()
    async def list_image_tags(image_name: str, registry: str = "dev") -> str:
        """List all tags for an image in a registry. Registry must be 'dev' or 'prod'. Returns tags as JSON array."""
        import json
        tags = await registry_client.list_tags(image_name, registry)
        return json.dumps({"image": image_name, "registry": registry, "tags": tags}, indent=2)

    @mcp.tool()
    async def get_image_manifest(image_name: str, tag: str, registry: str = "dev") -> str:
        """Get the manifest of a specific image:tag from a registry. Returns manifest digest and metadata."""
        import json
        data = await registry_client.get_manifest(image_name, tag, registry)
        return json.dumps({"image": image_name, "tag": tag, "registry": registry, "digest": data["digest"], "content_type": data["content_type"]}, indent=2)

    @mcp.tool()
    async def tag_image(image_name: str, current_tag: str, new_tag: str, registry: str = "dev") -> str:
        """Tag an existing image with a new tag in the specified registry (default: dev). Useful for versioning (e.g. latest -> v1.0.0)."""
        import json
        await registry_client.tag_image(image_name, current_tag, new_tag, registry)
        return json.dumps({"status": "success", "image": image_name, "from_tag": current_tag, "to_tag": new_tag, "registry": registry}, indent=2)
