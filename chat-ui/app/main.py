import json
import os
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from .models import (
    ChatRequest, ProviderConfig, ChatResponse, TokenUsage,
    VerificationResult, VerifyRequest, VerifyResponse,
)
from .mcp_client import list_tools
from .llm_providers import get_provider

app = FastAPI(title="MCP DevOps Lab Chat UI", version="1.0.0")

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


SYSTEM_PROMPT = """You are a helpful DevOps assistant. You have access to tools that let you manage users, Git repositories (Gitea), container registries, and image promotions.

When asked to perform tasks, use the available tools. Be concise in your responses and explain what you did after completing actions."""


@app.post("/api/chat")
async def chat(req: ChatRequest):
    try:
        # Get available MCP tools
        try:
            tools = await list_tools()
        except Exception:
            tools = []

        # Build conversation
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        for msg in req.history:
            messages.append({"role": msg.role, "content": msg.content})
        messages.append({"role": "user", "content": req.message})

        # Call LLM
        provider = get_provider(_provider_config)
        result = await provider.chat(messages, tools)

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
