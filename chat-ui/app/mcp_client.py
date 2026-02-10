import httpx
import json
import os

MCP_SERVER_URL = os.environ.get("MCP_SERVER_URL", "http://mcp-server:8003")
MCP_ENDPOINT = f"{MCP_SERVER_URL}/mcp"

HEADERS = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
}


def _parse_response(resp: httpx.Response) -> dict:
    """Parse MCP response — handles both JSON and SSE formats."""
    content_type = resp.headers.get("content-type", "")
    if "text/event-stream" in content_type:
        # Parse SSE: look for data lines containing JSON-RPC
        for line in resp.text.strip().split("\n"):
            if line.startswith("data: "):
                try:
                    return json.loads(line[6:])
                except json.JSONDecodeError:
                    continue
        return {}
    else:
        return resp.json()


async def _mcp_request(method: str, params: dict = None) -> dict:
    """Send a JSON-RPC request to the MCP server."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            MCP_ENDPOINT,
            json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}},
            headers=HEADERS,
            timeout=60.0,
        )
        resp.raise_for_status()
        return _parse_response(resp)


async def _initialize() -> dict:
    """Send initialize request to the MCP server."""
    return await _mcp_request("initialize", {
        "protocolVersion": "2024-11-05",
        "capabilities": {},
        "clientInfo": {"name": "mcp-lab-chat-ui", "version": "1.0.0"},
    })


async def list_tools() -> list[dict]:
    """List available tools from the MCP server."""
    # Initialize first (stateless mode requires this per-session)
    await _initialize()
    data = await _mcp_request("tools/list")
    return data.get("result", {}).get("tools", [])


async def call_tool(name: str, arguments: dict) -> str:
    """Call a tool on the MCP server and return the result."""
    await _initialize()
    data = await _mcp_request("tools/call", {"name": name, "arguments": arguments})
    result = data.get("result", {})
    content = result.get("content", [])
    texts = [c.get("text", "") for c in content if c.get("type") == "text"]
    return "\n".join(texts) if texts else json.dumps(result)


def mcp_tools_to_openai_format(tools: list[dict]) -> list[dict]:
    """Convert MCP tool definitions to OpenAI function-calling format."""
    openai_tools = []
    for tool in tools:
        openai_tools.append({
            "type": "function",
            "function": {
                "name": tool["name"],
                "description": tool.get("description", ""),
                "parameters": tool.get("inputSchema", {"type": "object", "properties": {}}),
            },
        })
    return openai_tools


def mcp_tools_to_anthropic_format(tools: list[dict]) -> list[dict]:
    """Convert MCP tool definitions to Anthropic tool format."""
    anthropic_tools = []
    for tool in tools:
        anthropic_tools.append({
            "name": tool["name"],
            "description": tool.get("description", ""),
            "input_schema": tool.get("inputSchema", {"type": "object", "properties": {}}),
        })
    return anthropic_tools


def mcp_tools_to_google_format(tools: list[dict]) -> list[dict]:
    """Convert MCP tool definitions to Google Gemini tool format."""
    functions = []
    for tool in tools:
        schema = tool.get("inputSchema", {"type": "object", "properties": {}})
        params = {
            "type": "OBJECT",
            "properties": {},
        }
        for prop_name, prop_def in schema.get("properties", {}).items():
            ptype = prop_def.get("type", "string").upper()
            params["properties"][prop_name] = {
                "type": ptype,
                "description": prop_def.get("description", ""),
            }
        required = schema.get("required", [])
        if required:
            params["required"] = required

        functions.append({
            "name": tool["name"],
            "description": tool.get("description", ""),
            "parameters": params,
        })
    return functions
