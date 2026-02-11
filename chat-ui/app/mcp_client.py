import httpx
import json
import os
import asyncio
import logging

logger = logging.getLogger(__name__)

# Parse MCP_SERVERS (comma-separated) or fall back to single MCP_SERVER_URL
_raw = os.environ.get(
    "MCP_SERVERS",
    os.environ.get("MCP_SERVER_URL", "http://mcp-user:8003"),
)
MCP_SERVER_URLS: list[str] = [u.strip() for u in _raw.split(",") if u.strip()]

HEADERS = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
}

# tool_name -> server_base_url mapping, rebuilt on each list_tools() call
_tool_server_map: dict[str, str] = {}


def _parse_response(resp: httpx.Response) -> dict:
    """Parse MCP response — handles both JSON and SSE formats."""
    content_type = resp.headers.get("content-type", "")
    if "text/event-stream" in content_type:
        for line in resp.text.strip().split("\n"):
            if line.startswith("data: "):
                try:
                    return json.loads(line[6:])
                except json.JSONDecodeError:
                    continue
        return {}
    else:
        return resp.json()


async def _mcp_request(server_url: str, method: str, params: dict = None) -> dict:
    """Send a JSON-RPC request to a specific MCP server."""
    endpoint = f"{server_url}/mcp"
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            endpoint,
            json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}},
            headers=HEADERS,
            timeout=60.0,
        )
        resp.raise_for_status()
        return _parse_response(resp)


async def _initialize(server_url: str) -> dict:
    """Send initialize request to a specific MCP server."""
    return await _mcp_request(server_url, "initialize", {
        "protocolVersion": "2024-11-05",
        "capabilities": {},
        "clientInfo": {"name": "mcp-lab-chat-ui", "version": "1.0.0"},
    })


async def _list_tools_from_server(server_url: str) -> list[dict]:
    """List tools from a single server. Returns empty list if unreachable."""
    try:
        await _initialize(server_url)
        data = await _mcp_request(server_url, "tools/list")
        return data.get("result", {}).get("tools", [])
    except Exception as e:
        logger.warning("MCP server %s unreachable: %s", server_url, e)
        return []


async def list_tools() -> list[dict]:
    """List tools from ALL configured MCP servers. Rebuilds tool->server map."""
    global _tool_server_map
    new_map: dict[str, str] = {}
    all_tools: list[dict] = []

    results = await asyncio.gather(
        *[_list_tools_from_server(url) for url in MCP_SERVER_URLS]
    )

    for server_url, tools in zip(MCP_SERVER_URLS, results):
        for tool in tools:
            new_map[tool["name"]] = server_url
            all_tools.append(tool)

    _tool_server_map = new_map
    return all_tools


async def call_tool(name: str, arguments: dict) -> str:
    """Call a tool, routing to the correct MCP server."""
    server_url = _tool_server_map.get(name)
    if not server_url:
        await list_tools()
        server_url = _tool_server_map.get(name)
    if not server_url:
        return json.dumps({"error": f"Unknown tool: {name}"})

    await _initialize(server_url)
    data = await _mcp_request(server_url, "tools/call", {"name": name, "arguments": arguments})
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
