from mcp.server.fastmcp import FastMCP
from . import config
from .tools import runner_tools, deploy_tools

mcp = FastMCP("mcp-runner", host="0.0.0.0", port=8007, stateless_http=True)
runner_tools.register(mcp)
deploy_tools.register(mcp)

if __name__ == "__main__":
    transport = config.MCP_TRANSPORT
    if transport == "stdio":
        mcp.run(transport="stdio")
    else:
        mcp.run(transport="streamable-http")
