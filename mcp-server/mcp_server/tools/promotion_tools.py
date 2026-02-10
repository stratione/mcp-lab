from mcp.server.fastmcp import FastMCP
import httpx
from .. import config


def register(mcp: FastMCP):
    @mcp.tool()
    async def promote_image(image_name: str, tag: str, promoted_by: str) -> str:
        """Promote a container image from dev to prod registry. Requires the promoter to have 'reviewer' or 'admin' role. Returns promotion result as JSON."""
        import json
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{config.PROMOTION_SERVICE_URL}/promote",
                json={"image_name": image_name, "tag": tag, "promoted_by": promoted_by},
                timeout=60.0,
            )
            resp.raise_for_status()
            return json.dumps(resp.json(), indent=2)

    @mcp.tool()
    async def list_promotions() -> str:
        """List all image promotion records. Returns a JSON array of promotion objects with status and audit info."""
        import json
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{config.PROMOTION_SERVICE_URL}/promotions", timeout=10.0)
            resp.raise_for_status()
            return json.dumps(resp.json(), indent=2)

    @mcp.tool()
    async def get_promotion_status(promotion_id: int) -> str:
        """Get the status of a specific promotion by its ID. Returns the promotion record as JSON."""
        import json
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{config.PROMOTION_SERVICE_URL}/promotions/{promotion_id}", timeout=10.0)
            resp.raise_for_status()
            return json.dumps(resp.json(), indent=2)
