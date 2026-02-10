import os
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from .models import ChatRequest, ProviderConfig, ChatResponse
from .mcp_client import list_tools
from .llm_providers import get_provider

app = FastAPI(title="MCP DevOps Lab Chat UI", version="1.0.0")

# In-memory provider config (session only)
_provider_config: dict = {
    "provider": os.environ.get("LLM_PROVIDER", "ollama"),
    "api_key": os.environ.get("LLM_API_KEY", ""),
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
            {"id": "ollama", "name": "Ollama (Local)", "requires_key": False, "default_model": "llama3.1"},
            {"id": "openai", "name": "OpenAI", "requires_key": True, "default_model": "gpt-4o"},
            {"id": "anthropic", "name": "Anthropic", "requires_key": True, "default_model": "claude-sonnet-4-5-20250929"},
            {"id": "google", "name": "Google Gemini", "requires_key": True, "default_model": "gemini-2.0-flash"},
        ],
        "active": _provider_config,
    }


@app.post("/api/provider")
async def set_provider(config: ProviderConfig):
    global _provider_config
    _provider_config = config.model_dump()
    if not _provider_config.get("base_url"):
        _provider_config["base_url"] = os.environ.get("OLLAMA_URL", "http://host.containers.internal:11434")
    return {"status": "ok", "config": _provider_config}


@app.get("/api/tools")
async def get_tools():
    try:
        tools = await list_tools()
        return {"tools": tools}
    except Exception as e:
        return {"tools": [], "error": str(e)}


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

        return ChatResponse(
            reply=result["reply"],
            tool_calls=[
                {"name": tc["name"], "arguments": tc["arguments"], "result": tc.get("result")}
                for tc in result.get("tool_calls", [])
            ],
        )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"detail": str(e)},
        )
