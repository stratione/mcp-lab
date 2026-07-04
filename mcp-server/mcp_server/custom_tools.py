"""Module 8 workspace — build your own MCP tool.

This file is YOURS. It is imported by the mcp-user server (server_user.py),
so any tool you register here is served on http://localhost:8003/mcp next to
the stock user tools. The loop:

    1. Write (or uncomment) a tool below.
    2. Rebuild + restart the server:
           docker compose build mcp-user && docker compose up -d mcp-user
    3. See it appear:  ./labctl check 8   (or tools/list via curl — module 8
       shows the raw JSON-RPC call)
    4. Ask the chat to use it. No re-registration, no config — the model
       discovers tools from tools/list on every conversation.

Anatomy of a tool — three parts, all of which the model can see:

    @mcp.tool()                          # registers it in tools/list
    async def my_tool(arg: str) -> str:  # the SIGNATURE becomes the JSON schema
        \"\"\"The DOCSTRING is the prompt.\"\"\"  # the model reads this to decide
        ...                                    # when (and whether) to call you

Docstring craft is the whole game: say what the tool returns, when to use it,
and what the arguments mean. Vague docstring → the model guesses; crisp
docstring → the model picks your tool at the right moment. After it works,
try changing ONLY the docstring, rebuild, and watch tool selection change.
"""

from mcp.server.fastmcp import FastMCP


def register(mcp: FastMCP):
    # ------------------------------------------------------------------
    # Worked example: pipeline_health — one call that answers "how is the
    # delivery pipeline doing?" by aggregating the registries and the
    # promotion audit log. Uncomment the block, rebuild mcp-user, done.
    # ------------------------------------------------------------------
    # import json
    # import httpx
    # from . import config
    #
    # @mcp.tool()
    # async def pipeline_health() -> str:
    #     """One-call health summary of the delivery pipeline: which images
    #     are in the dev, staging, and prod registries, and the five most
    #     recent promotion audit entries. Use this when asked for a pipeline
    #     overview or status instead of querying each registry separately."""
    #     out: dict = {"registries": {}, "recent_promotions": []}
    #     async with httpx.AsyncClient(timeout=10.0) as client:
    #         for name, base in (
    #             ("dev", config.DEV_REGISTRY_URL),
    #             ("staging", config.STAGING_REGISTRY_URL),
    #             ("prod", config.PROD_REGISTRY_URL),
    #         ):
    #             try:
    #                 resp = await client.get(f"{base}/v2/_catalog")
    #                 out["registries"][name] = resp.json().get("repositories", [])
    #             except httpx.HTTPError as e:
    #                 out["registries"][name] = f"unreachable: {e}"
    #         try:
    #             resp = await client.get(
    #                 f"{config.PROMOTION_SERVICE_URL}/promotions", params={"limit": 5}
    #             )
    #             out["recent_promotions"] = resp.json()
    #         except httpx.HTTPError as e:
    #             out["recent_promotions"] = f"unreachable: {e}"
    #     return json.dumps(out, indent=2)

    # Your tools go here. Delete `pass` once you've added one.
    pass
