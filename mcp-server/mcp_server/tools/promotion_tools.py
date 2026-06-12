from mcp.server.fastmcp import FastMCP
import httpx
from .. import config
from ..clients import check_response


def register(mcp: FastMCP):
    @mcp.tool()
    async def promote_image(image_name: str, tag: str, promoted_by: str,
                            from_registry: str = "dev", to_registry: str = "prod") -> str:
        """Promote a container image from one registry to another.

        Args:
            image_name: image to promote (e.g. "hello-app").
            tag: tag to promote (e.g. "latest" or "v1.0.0").
            promoted_by: username recorded in the audit log. Any string is
                accepted — there is no role gate. Pick a real username from
                `list_users` if you want the audit trail to be meaningful;
                "admin" is fine as a default if the user didn't specify.
            from_registry: source registry — dev, staging or prod (default dev).
            to_registry: target registry — dev, staging or prod (default prod).
                Under the three-stage policy only dev→staging and
                staging→prod are legal; check `get_promotion_policy` if a
                promotion is rejected.

        Returns the promotion result as JSON.
        """
        import json
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{config.PROMOTION_SERVICE_URL}/promote",
                json={
                    "image_name": image_name,
                    "tag": tag,
                    "promoted_by": promoted_by,
                    "from_registry": from_registry,
                    "to_registry": to_registry,
                },
                timeout=60.0,
            )
            check_response(resp)
            return json.dumps(resp.json(), indent=2)

    @mcp.tool()
    async def rollback_deployment(image_name: str, environment: str, rolled_back_by: str,
                                  tag: str = "latest") -> str:
        """Roll back an image in an environment's registry to the previously
        promoted version (re-copies the prior successful promotion's digest).

        Args:
            image_name: image to roll back (e.g. "hello-app").
            environment: which registry to roll back — "staging" or "prod".
            rolled_back_by: username recorded in the audit log.
            tag: tag to roll back (default "latest").

        Returns the rollback audit record as JSON.
        """
        import json
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{config.PROMOTION_SERVICE_URL}/rollback",
                json={
                    "image_name": image_name,
                    "tag": tag,
                    "environment": environment,
                    "rolled_back_by": rolled_back_by,
                },
                timeout=60.0,
            )
            check_response(resp)
            return json.dumps(resp.json(), indent=2)

    @mcp.tool()
    async def list_promotions() -> str:
        """List all image promotion records. Returns a JSON array of promotion objects with status and audit info."""
        import json
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{config.PROMOTION_SERVICE_URL}/promotions", timeout=10.0)
            check_response(resp)
            return json.dumps(resp.json(), indent=2)

    @mcp.tool()
    async def get_promotion_status(promotion_id: int) -> str:
        """Get the status of a specific promotion by its ID. Returns the promotion record as JSON."""
        import json
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{config.PROMOTION_SERVICE_URL}/promotions/{promotion_id}", timeout=10.0)
            check_response(resp)
            return json.dumps(resp.json(), indent=2)

    @mcp.tool()
    async def list_scans(image_name: str = "") -> str:
        """List recorded security scan results, newest first. Optionally filter
        by image name. Returns a JSON array of scan records (severity counts
        and pass/fail, full report omitted)."""
        import json
        params = {"image_name": image_name} if image_name else None
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{config.PROMOTION_SERVICE_URL}/scans",
                params=params,
                timeout=10.0,
            )
            check_response(resp)
            return json.dumps(resp.json(), indent=2)

    @mcp.tool()
    async def get_promotion_policy() -> str:
        """Get the promotion policy in force: flow (two-stage / three-stage),
        whether a passing scan is required, the max allowed critical CVEs,
        and which promotions are legal. Returns JSON."""
        import json
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{config.PROMOTION_SERVICE_URL}/policy", timeout=10.0)
            check_response(resp)
            return json.dumps(resp.json(), indent=2)
