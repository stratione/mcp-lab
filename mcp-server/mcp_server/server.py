import os
from mcp.server.fastmcp import FastMCP
from . import config
from .tools import user_tools, gitea_tools, registry_tools, promotion_tools

mcp = FastMCP("mcp-devops-lab", host="0.0.0.0", port=8003, stateless_http=True)

# Conditionally register user tools
if config.USER_MCP_ENABLED:
    user_tools.register(mcp)

# Conditionally register feature-switched tools
if config.GITEA_MCP_ENABLED:
    gitea_tools.register(mcp)

if config.REGISTRY_MCP_ENABLED:
    registry_tools.register(mcp)

if config.PROMOTION_MCP_ENABLED:
    promotion_tools.register(mcp)


if __name__ == "__main__":
    transport = config.MCP_TRANSPORT
    if transport == "stdio":
        mcp.run(transport="stdio")
    else:
        mcp.run(transport="streamable-http")
