from mcp.server.fastmcp import FastMCP
from . import config
from .tools import promotion_tools

mcp = FastMCP("mcp-promotion", host="0.0.0.0", port=8006, stateless_http=True)
promotion_tools.register(mcp)

if __name__ == "__main__":
    transport = config.MCP_TRANSPORT
    if transport == "stdio":
        mcp.run(transport="stdio")
    else:
        mcp.run(transport="streamable-http")
