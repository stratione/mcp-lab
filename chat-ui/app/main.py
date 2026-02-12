import asyncio
import json
import os
import pathlib
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from .models import (
    ChatRequest, ProviderConfig, ChatResponse, TokenUsage,
    VerificationResult, VerifyRequest, VerifyResponse,
)
from .mcp_client import list_tools, check_servers
from .llm_providers import get_provider

app = FastAPI(title="MCP DevOps Lab Chat UI", version="1.0.0")

# Server-side chat history storage (persisted in Docker volume)
CHAT_DATA_DIR = pathlib.Path(os.environ.get("CHAT_DATA_DIR", "/app/data"))
CHAT_HISTORY_FILE = CHAT_DATA_DIR / "chat_history.json"

# Per-provider API keys from environment
_API_KEYS: dict = {
    "anthropic": os.environ.get("ANTHROPIC_API_KEY", ""),
    "openai": os.environ.get("OPENAI_API_KEY", ""),
    "google": os.environ.get("GOOGLE_API_KEY", ""),
}

def _resolve_api_key(provider: str, explicit_key: str = "") -> str:
    """Return the explicit key if provided, otherwise look up the env-based key."""
    if explicit_key:
        return explicit_key
    return _API_KEYS.get(provider, "")

# In-memory provider config (session only)
_default_provider = os.environ.get("LLM_PROVIDER", "ollama")
_provider_config: dict = {
    "provider": _default_provider,
    "api_key": _resolve_api_key(_default_provider),
    "model": os.environ.get("LLM_MODEL", ""),
    "base_url": os.environ.get("OLLAMA_URL", "http://host.containers.internal:11434"),
}

STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
async def index():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))


@app.get("/health")
async def health():
    return {"status": "ok", "service": "chat-ui"}


@app.get("/api/providers")
async def get_providers():
    return {
        "providers": [
            {"id": "ollama", "name": "Ollama (Local)", "requires_key": False, "default_model": "llama3.1:8b", "has_key": True},
            {"id": "openai", "name": "OpenAI", "requires_key": True, "default_model": "gpt-4o", "has_key": bool(_API_KEYS.get("openai"))},
            {"id": "anthropic", "name": "Anthropic", "requires_key": True, "default_model": "claude-sonnet-4-5-20250929", "has_key": bool(_API_KEYS.get("anthropic"))},
            {"id": "google", "name": "Google Gemini", "requires_key": True, "default_model": "gemini-2.0-flash", "has_key": bool(_API_KEYS.get("google"))},
        ],
        "active": _provider_config,
    }


@app.post("/api/provider")
async def set_provider(config: ProviderConfig):
    global _provider_config
    _provider_config = config.model_dump()
    if not _provider_config.get("base_url"):
        _provider_config["base_url"] = os.environ.get("OLLAMA_URL", "http://host.containers.internal:11434")
    # Auto-resolve API key from env if not explicitly provided
    provider = _provider_config.get("provider", "ollama")
    if not _provider_config.get("api_key"):
        _provider_config["api_key"] = _resolve_api_key(provider)
    return {"status": "ok", "config": _provider_config}


@app.get("/api/tools")
async def get_tools():
    try:
        tools = await list_tools()
        return {"tools": tools}
    except Exception as e:
        return {"tools": [], "error": str(e)}


_CONTAINER_ENGINE = os.environ.get("CONTAINER_ENGINE", "docker")

# MCP server controls — opt-in via ENABLE_MCP_CONTROLS=true in .env.
# Requires /var/run/docker.sock to be mounted into this container.
# Only the four known MCP service names can be started or stopped; no
# arbitrary container or shell access is possible through this endpoint.
_MCP_CONTROLS_ENABLED = os.environ.get("ENABLE_MCP_CONTROLS", "false").lower() == "true"
_ALLOWED_MCP_SERVICES = {"user", "gitea", "registry", "promotion"}


def _get_docker_client():
    """Return a docker.DockerClient connected via the local socket, or None."""
    try:
        import docker
        return docker.from_env()
    except Exception:
        return None


@app.get("/api/mcp-controls")
async def mcp_controls_status():
    """Report whether in-UI MCP start/stop controls are available."""
    if not _MCP_CONTROLS_ENABLED:
        return {"enabled": False, "reason": "ENABLE_MCP_CONTROLS not set"}
    client = _get_docker_client()
    if client is None:
        return {"enabled": False, "reason": "Docker socket not accessible"}
    try:
        client.ping()
        return {"enabled": True}
    except Exception as exc:
        return {"enabled": False, "reason": str(exc)}


@app.post("/api/mcp/toggle")
async def toggle_mcp_server(request: Request):
    """Start or stop a single MCP server container.

    Body: {"service": "user"|"gitea"|"registry"|"promotion", "action": "start"|"stop"}
    """
    if not _MCP_CONTROLS_ENABLED:
        return JSONResponse(status_code=403, content={"error": "MCP controls not enabled"})

    data = await request.json()
    service = data.get("service", "")
    action = data.get("action", "")

    if service not in _ALLOWED_MCP_SERVICES or action not in ("start", "stop"):
        return JSONResponse(status_code=400, content={"error": "Invalid service or action"})

    def _do_toggle():
        client = _get_docker_client()
        if client is None:
            raise RuntimeError("Docker socket not accessible")
        # Locate by the compose service label so the project-name prefix doesn't matter
        containers = client.containers.list(
            all=True,
            filters={"label": f"com.docker.compose.service=mcp-{service}"},
        )
        if not containers:
            raise RuntimeError(f"Container mcp-{service} not found")
        container = containers[0]
        if action == "start":
            container.start()
        else:
            container.stop(timeout=10)

    try:
        # Run the blocking SDK calls in a thread so we don't block the event loop
        await asyncio.get_event_loop().run_in_executor(None, _do_toggle)
        return {"status": "ok", "service": service, "action": action}
    except Exception as exc:
        return JSONResponse(status_code=500, content={"error": str(exc)})


@app.get("/api/mcp-status")
async def mcp_status():
    try:
        servers = await check_servers()
        total = sum(s["tool_count"] for s in servers)
        online = sum(1 for s in servers if s["status"] == "online")
        return {"servers": servers, "total_tools": total, "online_count": online, "engine": _CONTAINER_ENGINE}
    except Exception as e:
        return {"servers": [], "total_tools": 0, "online_count": 0, "engine": _CONTAINER_ENGINE, "error": str(e)}


@app.get("/api/chat-history")
async def get_chat_history():
    try:
        if CHAT_HISTORY_FILE.exists():
            return JSONResponse(content=json.loads(CHAT_HISTORY_FILE.read_text()))
        return JSONResponse(content={"turns": [], "history": [], "sessionTokens": 0})
    except Exception:
        return JSONResponse(content={"turns": [], "history": [], "sessionTokens": 0})


@app.post("/api/chat-history")
async def save_chat_history(request: Request):
    try:
        data = await request.json()
        CHAT_DATA_DIR.mkdir(parents=True, exist_ok=True)
        CHAT_HISTORY_FILE.write_text(json.dumps(data))
        return {"status": "ok"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": str(e)})


@app.delete("/api/chat-history")
async def clear_chat_history():
    try:
        if CHAT_HISTORY_FILE.exists():
            CHAT_HISTORY_FILE.unlink()
        return {"status": "ok"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": str(e)})


def _extract_checkable_values(data, values=None):
    """Recursively extract string/number leaf values from parsed JSON."""
    if values is None:
        values = []
    if isinstance(data, dict):
        for v in data.values():
            _extract_checkable_values(v, values)
    elif isinstance(data, list):
        for item in data:
            _extract_checkable_values(item, values)
    elif isinstance(data, str):
        stripped = data.strip()
        if len(stripped) >= 2 and stripped.lower() not in ("true", "false", "null", "none", "ok"):
            values.append(stripped)
    elif isinstance(data, (int, float)) and not isinstance(data, bool):
        if data not in (0, 1):
            values.append(str(data))
    return values


def _verify_with_heuristics(reply: str, tool_calls: list[dict]) -> dict:
    """Compare LLM reply against actual tool results using string matching."""
    if not tool_calls:
        return {"status": "unverified", "details": "No tools were used"}

    reply_lower = reply.lower()
    total_checks = 0
    matched = 0

    for tc in tool_calls:
        result_str = tc.get("result")
        if not result_str:
            continue
        try:
            result_data = json.loads(result_str)
        except (json.JSONDecodeError, TypeError):
            if len(result_str.strip()) >= 2:
                total_checks += 1
                if result_str.strip().lower() in reply_lower:
                    matched += 1
            continue

        values = _extract_checkable_values(result_data)
        for val in values:
            total_checks += 1
            if val.lower() in reply_lower:
                matched += 1

    if total_checks == 0:
        return {"status": "unverified", "details": "No verifiable data in tool results"}

    ratio = matched / total_checks
    if ratio >= 0.3:
        return {"status": "verified", "details": f"Reply references {matched}/{total_checks} data points from tool results"}
    else:
        return {"status": "uncertain", "details": f"Reply only references {matched}/{total_checks} data points from tool results"}


SYSTEM_PROMPT_BASE = """You are a helpful DevOps assistant in the MCP DevOps Lab. You have access to tools provided by MCP (Model Context Protocol) servers that let you manage users, Git repositories (Gitea), container registries, and image promotions.

When asked to perform tasks, use the available tools. Be concise in your responses and explain what you did after completing actions.

{mcp_context}"""


def _build_system_prompt(servers: list[dict], tools: list[dict]) -> str:
    """Build system prompt with live MCP server and tool context."""
    if not servers:
        mcp_context = "No MCP servers are currently connected."
    else:
        online = [s for s in servers if s["status"] == "online"]
        offline = [s for s in servers if s["status"] == "offline"]
        lines = [f"You are connected to {len(online)} of {len(servers)} MCP servers:"]
        for s in servers:
            status = "ONLINE" if s["status"] == "online" else "OFFLINE"
            tool_names = ", ".join(s["tools"]) if s["tools"] else "none"
            lines.append(f"  - mcp-{s['name']} ({status}): {s['tool_count']} tools [{tool_names}]")
        if tools:
            lines.append(f"\nTotal available tools: {len(tools)}")
        mcp_context = "\n".join(lines)
    return SYSTEM_PROMPT_BASE.format(mcp_context=mcp_context)


@app.post("/api/chat")
async def chat(req: ChatRequest):
    try:
        # Get available MCP tools and server status
        try:
            servers = await check_servers()
            tools = []
            for s in servers:
                if s["status"] == "online":
                    for t_name in s["tools"]:
                        tools.append(t_name)
            all_tools = await list_tools()
        except Exception:
            servers = []
            all_tools = []

        # Build conversation with dynamic system prompt
        system_prompt = _build_system_prompt(servers, all_tools)
        messages = [{"role": "system", "content": system_prompt}]
        for msg in req.history:
            messages.append({"role": msg.role, "content": msg.content})
        messages.append({"role": "user", "content": req.message})

        # Call LLM
        provider = get_provider(_provider_config)
        result = await provider.chat(messages, all_tools)

        usage_data = result.get("token_usage", {})
        tool_calls_data = [
            {"name": tc["name"], "arguments": tc["arguments"], "result": tc.get("result")}
            for tc in result.get("tool_calls", [])
        ]
        verification = _verify_with_heuristics(result["reply"], tool_calls_data)
        return ChatResponse(
            reply=result["reply"],
            tool_calls=tool_calls_data,
            token_usage=TokenUsage(
                input_tokens=usage_data.get("input_tokens", 0),
                output_tokens=usage_data.get("output_tokens", 0),
                total_tokens=usage_data.get("total_tokens", 0),
            ),
            verification=VerificationResult(**verification),
        )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"detail": str(e)},
        )


VERIFY_PROMPT = """You are a fact-checking assistant. Compare the assistant's response against the actual tool results below. Check if the assistant accurately reported the data returned by the tools.

Assistant's response:
{reply}

Tool calls and their actual results:
{tool_details}

Rate the accuracy as exactly one of:
- VERIFIED: The claims in the response accurately reflect the tool results
- UNCERTAIN: Some claims cannot be fully verified against the tool results
- HALLUCINATION: The response contains claims that contradict or fabricate data not in the tool results

Respond with your rating on the first line (just the word), then a brief explanation."""


@app.post("/api/verify")
async def verify(req: VerifyRequest):
    try:
        tool_details = ""
        for i, tc in enumerate(req.tool_calls, 1):
            tool_details += f"\n--- Tool Call {i}: {tc.name} ---\n"
            tool_details += f"Arguments: {json.dumps(tc.arguments)}\n"
            tool_details += f"Result: {tc.result or '(no result)'}\n"

        prompt = VERIFY_PROMPT.format(
            reply=req.reply,
            tool_details=tool_details or "(no tool calls)",
        )

        provider = get_provider(_provider_config)
        result = await provider.chat([{"role": "user", "content": prompt}], [])

        reply_text = result.get("reply", "")
        first_line = reply_text.strip().split("\n")[0].strip().upper()
        if "VERIFIED" in first_line and "HALLUCINATION" not in first_line:
            status = "verified"
        elif "HALLUCINATION" in first_line:
            status = "hallucination"
        else:
            status = "uncertain"

        lines = reply_text.strip().split("\n")
        explanation = "\n".join(lines[1:]).strip() if len(lines) > 1 else reply_text

        usage_data = result.get("token_usage", {})
        return VerifyResponse(
            status=status,
            explanation=explanation,
            token_usage=TokenUsage(
                input_tokens=usage_data.get("input_tokens", 0),
                output_tokens=usage_data.get("output_tokens", 0),
                total_tokens=usage_data.get("total_tokens", 0),
            ),
        )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"detail": str(e)},
        )
