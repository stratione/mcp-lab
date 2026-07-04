from mcp.server.fastmcp import FastMCP
from . import config, custom_tools
from .tools import user_tools

mcp = FastMCP("mcp-user", host="0.0.0.0", port=8003, stateless_http=True)
user_tools.register(mcp)
# Module 8 (build your own MCP tool): learner-authored tools live in
# custom_tools.py and are served right next to the stock ones.
custom_tools.register(mcp)

if __name__ == "__main__":
    transport = config.MCP_TRANSPORT
    if transport == "stdio":
        mcp.run(transport="stdio")
    else:
        mcp.run(transport="streamable-http")
