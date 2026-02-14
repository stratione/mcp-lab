from mcp.server.fastmcp import FastMCP
from .tools import runner_tools, deploy_tools

# Create the MCP server
mcp = FastMCP("mcp-runner")

# Register tools
runner_tools.register(mcp)
deploy_tools.register(mcp)

if __name__ == "__main__":
    mcp.run()
