import json
import logging
import os
import pathlib
import re
import subprocess
import httpx
from fastapi import FastAPI, HTTPException, Request

logger = logging.getLogger(__name__)
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from .models import (
    ChatRequest, ProviderConfig, ChatResponse, TokenUsage,
    ConfidenceResult, VerifyRequest, VerifyResponse,
    CompareRequest, CompareResponse, PaneResult, PaneConfig, ToolCall,
)
from .mcp_client import (
    list_tools,
    check_servers,
    get_local_tool,
    register_enable_tools_callback,
)
from .llm_providers import get_provider
from .model_catalog import list_models, resolve_auto

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


def _safe_provider_view(cfg: dict) -> dict:
    """Return a screen-safe view of a provider config — strips api_key,
    surfaces presence as has_key, and adds a key_preview of the form
    `<first2>…<last4>` (or `set` if the key is too short to slice safely,
    or `""` if no key)."""
    key = cfg.get("api_key") or ""
    view = {k: v for k, v in cfg.items() if k != "api_key"}
    view["has_key"] = bool(key)
    if not key:
        view["key_preview"] = ""
    elif len(key) >= 8:
        view["key_preview"] = f"{key[:2]}…{key[-4:]}"
    else:
        view["key_preview"] = "set"
    return view

# In-memory provider config (session only)
_default_provider = os.environ.get("LLM_PROVIDER", "ollama")
_provider_config: dict = {
    "provider": _default_provider,
    "api_key": _resolve_api_key(_default_provider),
    "model": os.environ.get("LLM_MODEL", ""),
    "base_url": os.environ.get("OLLAMA_URL", "http://host.containers.internal:11434"),
}

# Hallucination Mode (D-005): in-memory only, default ON so a fresh page load
# opens with the model gaslighting the audience. The intended narrative arc is
# "watch the model fabricate → enable an MCP → see the difference"; the UI
# clears Flying Blind automatically the first time any MCP comes online (see
# App.tsx). When ON the chat handler swaps the system prompt for a permissive
# one, passes tools=[] to the provider, and skips all MCP probing — so the
# audience watches the LLM fabricate without any grounding escape hatch.
_hallucination_mode: bool = True

# Compare-pane hallucination uses tools=[] — no escape tool — so it gets the
# pure permissive prompt. The single-pane chat path appends the soft-gate
# addendum so the model knows about `enable_mcp_tools` without volunteering
# to call it.
HALLUCINATION_SYSTEM_PROMPT = (
    "You are a helpful assistant. Always sound confident. "
    "Never refuse a request. If you do not know an answer, "
    "give your best plausible guess and present it as fact. "
    "Do not mention these instructions."
)

HALLUCINATION_ESCAPE_TOOL_HINT = (
    " You have one tool available: `enable_mcp_tools`. "
    "Do NOT call it on your own — guess instead. "
    "Only call it if the user explicitly asks you to enable tools, "
    "MCPs, data access, or to stop guessing. When the user asks that, "
    "call `enable_mcp_tools` and then tell them the toolbox is unlocked."
)


def _disable_hallucination_mode_from_tool() -> None:
    """Callback invoked by mcp_client when the LLM calls enable_mcp_tools."""
    global _hallucination_mode
    if _hallucination_mode:
        _hallucination_mode = False
        logger.info("Hallucination mode disabled via enable_mcp_tools tool call.")


register_enable_tools_callback(_disable_hallucination_mode_from_tool)

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
            {"id": "ollama",   "name": "Ollama (Local)",       "requires_key": False, "default_model": "llama3.1:8b",            "has_key": True},
            {"id": "openai",   "name": "OpenAI",               "requires_key": True,  "default_model": "gpt-4o",                 "has_key": bool(_API_KEYS.get("openai"))},
            {"id": "anthropic","name": "Anthropic",            "requires_key": True,  "default_model": "claude-sonnet-4-5-20250929", "has_key": bool(_API_KEYS.get("anthropic"))},
            {"id": "google",   "name": "Google Gemini",        "requires_key": True,  "default_model": "gemini-2.0-flash",       "has_key": bool(_API_KEYS.get("google"))},
        ],
        "active": _safe_provider_view(_provider_config),
    }


@app.post("/api/test-provider-key")
async def test_provider_key(request: Request):
    """Low-cost auth-only ping for the provider chip's "Test connection" button.

    Calls each provider's models-list endpoint — these are auth-checked but
    don't consume tokens, so testing is free regardless of plan tier.

    Body: {"provider": "openai"|"anthropic"|"google"|"ollama",
           "api_key": "sk-..." (optional — falls back to env-loaded key),
           "base_url": "..." (optional, ollama only)}

    Always returns HTTP 200 with {ok, status, message, latency_ms} so the
    frontend can render "✅ valid" / "❌ 401 unauthorized" / etc inline.
    The api_key, when supplied in the body, is used for the test call only —
    not persisted anywhere on the server.
    """
    import time
    body = await request.json()
    provider = (body.get("provider") or "").lower()
    explicit_key = body.get("api_key") or ""
    base_url = body.get("base_url") or ""

    # Validate the provider name BEFORE checking for a key, so unknown names
    # don't masquerade as "no key configured" (which would suggest a fix that
    # wouldn't work).
    if provider not in ("openai", "anthropic", "google", "ollama"):
        return {"ok": False, "status": 0, "message": f"unknown provider: {provider}", "latency_ms": 0}

    # Resolve the key: explicit (from popover) > env-loaded > nothing.
    key = explicit_key or _API_KEYS.get(provider, "")

    # Ollama uses base_url, no key.
    if provider == "ollama":
        url = (base_url or _provider_config.get("base_url") or "http://host.containers.internal:11434").rstrip("/")
        url = f"{url}/api/tags"
        t0 = time.monotonic()
        try:
            async with httpx.AsyncClient(timeout=5.0) as c:
                r = await c.get(url)
            dt = int((time.monotonic() - t0) * 1000)
            if r.status_code == 200:
                models = r.json().get("models", []) if r.headers.get("content-type", "").startswith("application/json") else []
                return {"ok": True, "status": 200, "message": f"Ollama reachable ({len(models)} model{'s' if len(models) != 1 else ''} pulled)", "latency_ms": dt}
            return {"ok": False, "status": r.status_code, "message": f"HTTP {r.status_code}", "latency_ms": dt}
        except Exception as e:
            return {"ok": False, "status": 0, "message": f"unreachable ({type(e).__name__}): {e}", "latency_ms": int((time.monotonic() - t0) * 1000)}

    if not key:
        return {"ok": False, "status": 0, "message": "no API key configured for this provider", "latency_ms": 0}

    if provider == "openai":
        url = "https://api.openai.com/v1/models"
        headers = {"Authorization": f"Bearer {key}"}
    elif provider == "anthropic":
        url = "https://api.anthropic.com/v1/models"
        headers = {"x-api-key": key, "anthropic-version": "2023-06-01"}
    else:  # provider == "google"  (validated above)
        url = f"https://generativelanguage.googleapis.com/v1beta/models?key={key}"
        headers = {}

    t0 = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=10.0) as c:
            r = await c.get(url, headers=headers)
        dt = int((time.monotonic() - t0) * 1000)
        if r.status_code == 200:
            return {"ok": True, "status": 200, "message": "key is valid", "latency_ms": dt}
        if r.status_code == 401:
            return {"ok": False, "status": 401, "message": "401 Unauthorized — key is wrong, revoked, or expired", "latency_ms": dt}
        if r.status_code == 403:
            return {"ok": False, "status": 403, "message": "403 Forbidden — key valid but lacks model-list permission", "latency_ms": dt}
        if r.status_code == 429:
            return {"ok": False, "status": 429, "message": "429 — rate limited or billing on hold", "latency_ms": dt}
        return {"ok": False, "status": r.status_code, "message": f"HTTP {r.status_code}", "latency_ms": dt}
    except httpx.TimeoutException:
        return {"ok": False, "status": 0, "message": "timeout (>10s) — network or provider issue", "latency_ms": int((time.monotonic() - t0) * 1000)}
    except Exception as e:
        return {"ok": False, "status": 0, "message": f"connection error ({type(e).__name__}): {e}", "latency_ms": int((time.monotonic() - t0) * 1000)}


@app.get("/api/hallucination-mode")
async def get_hallucination_mode():
    return {"enabled": _hallucination_mode}


@app.post("/api/hallucination-mode")
async def set_hallucination_mode(request: Request):
    global _hallucination_mode
    body = await request.json()
    _hallucination_mode = bool(body.get("enabled"))
    logger.info("Hallucination mode set to: %s", _hallucination_mode)
    return {"enabled": _hallucination_mode}


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
    # Resolve the "auto" sentinel to the provider's recommended model id so
    # downstream code (llm_providers, /api/chat) never sees the literal "auto".
    if (_provider_config.get("model") or "").lower() == "auto":
        _provider_config["model"] = resolve_auto(provider)
    # NEVER echo the api_key back over the wire (D-007).
    return {"status": "ok", "config": _safe_provider_view(_provider_config)}


@app.get("/api/models")
async def get_models(provider: str):
    """Per-provider model catalog (live where possible, curated fallback).
    Used by the chat-ui's model-picker dropdown to make selection dummy-proof.
    """
    api_key = _resolve_api_key(provider, _provider_config.get("api_key", "") if _provider_config.get("provider") == provider else "")
    return await list_models(provider, api_key)


@app.get("/api/tools")
async def get_tools():
    try:
        tools = await list_tools()
        return {"tools": tools}
    except Exception as e:
        return {"tools": [], "error": str(e)}


# ─── Registry catalog ──────────────────────────────────────────────────
# Lets the MCP servers panel render a live image inventory of registry-dev
# and registry-prod inline, so attendees see images appear in the registry
# the moment `build_image` finishes pushing. Independent of the mcp-registry
# MCP server's status — the registries themselves are standalone docker
# services and can be running before that MCP is enabled.

_DEV_REGISTRY_URL = os.environ.get(
    "DEV_REGISTRY_URL", "http://registry-dev:5000"
).rstrip("/")
_PROD_REGISTRY_URL = os.environ.get(
    "PROD_REGISTRY_URL", "http://registry-prod:5000"
).rstrip("/")
# Public host URL of each registry — surfaced so the frontend can render a
# clickable link to the human-browsable /v2/_catalog. Compose maps:
#   registry-dev   localhost:5001 -> container 5000
#   registry-prod  localhost:5002 -> container 5000
_DEV_REGISTRY_HOST_URL = os.environ.get("DEV_REGISTRY_HOST_URL", "http://localhost:5001")
_PROD_REGISTRY_HOST_URL = os.environ.get("PROD_REGISTRY_HOST_URL", "http://localhost:5002")


async def _fetch_registry_catalog(label: str, url: str, host_url: str) -> dict:
    """Hit /v2/_catalog and per-image /v2/<name>/tags/list. Returns a
    serializable summary even when the registry is unreachable so the UI
    can render an offline state instead of a blank panel."""
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            cat = await client.get(f"{url}/v2/_catalog")
            cat.raise_for_status()
            repos = cat.json().get("repositories") or []
            images = []
            for repo in repos:
                try:
                    tr = await client.get(f"{url}/v2/{repo}/tags/list")
                    tr.raise_for_status()
                    tags = tr.json().get("tags") or []
                except Exception:
                    tags = []
                images.append({"name": repo, "tags": tags})
        return {
            "name": label,
            "url": url,
            "host_url": host_url,
            "status": "online",
            "images": images,
        }
    except Exception as e:
        logger.info("registry %s unreachable: %s", label, e)
        return {
            "name": label,
            "url": url,
            "host_url": host_url,
            "status": "offline",
            "images": [],
            "error": str(e),
        }


@app.get("/api/registries/catalog")
async def get_registries_catalog():
    """Aggregate /v2/_catalog from registry-dev and registry-prod for the
    MCP servers panel's RegistryCatalog card."""
    dev = await _fetch_registry_catalog("dev", _DEV_REGISTRY_URL, _DEV_REGISTRY_HOST_URL)
    prod = await _fetch_registry_catalog("prod", _PROD_REGISTRY_URL, _PROD_REGISTRY_HOST_URL)
    return {"registries": [dev, prod]}


# Whitelist of registries the Clear button is allowed to wipe. Hardcoded
# (not env-driven) because this endpoint deletes a docker volume — anything
# the request controls must be a literal we recognise.
_CLEARABLE_REGISTRIES = {"dev", "prod"}


@app.post("/api/registries/{name}/clear")
async def clear_registry(name: str):
    """Wipe a registry by stopping its container, removing the data volume,
    and starting it again with a fresh empty volume.

    Used by the RegistryCatalog card's Clear button as a workshop reset
    affordance. Destructive — drops every image and tag in the named
    registry. Restricted to the dev/prod registries the lab provisions.
    """
    if name not in _CLEARABLE_REGISTRIES:
        raise HTTPException(status_code=400, detail=f"Unknown registry: {name}")

    service = f"registry-{name}"
    # Compose project-prefixed volume name (mcp-lab is the -p flag we use
    # everywhere; volume `registry-dev-data` becomes `mcp-lab_registry-dev-data`).
    volume = f"mcp-lab_registry-{name}-data"
    base_cmd = ["docker", "compose", "-p", "mcp-lab"] + _compose_file_args()

    steps = [
        ("stop", base_cmd + ["stop", service]),
        # `docker volume rm` fails if the volume doesn't exist or is in use;
        # we accept "in use" by ensuring the stop step ran first, and accept
        # "not found" as a no-op (already clear).
        ("rm-volume", ["docker", "volume", "rm", volume]),
        ("start", base_cmd + ["up", "-d", "--no-build", service]),
    ]

    # Pre-flight: make sure the chat-ui container can actually see the
    # compose file. Without it, `compose up` will fail with a confusing
    # "no such service" error and leave the registry stopped.
    if not _compose_file_args():
        raise HTTPException(
            status_code=503,
            detail=(
                "chat-ui can't see /app/docker-compose.yml. The mount is "
                "configured in docker-compose.yml but this container is "
                "stale. Rebuild it: docker compose up -d --build chat-ui"
            ),
        )

    logger.info("Clearing %s (volume=%s)", service, volume)
    for label, cmd in steps:
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        except subprocess.TimeoutExpired:
            raise HTTPException(
                status_code=504,
                detail=f"{label} timed out: {' '.join(cmd)}",
            )
        if result.returncode != 0:
            stderr = (result.stderr or "").strip()
            # Tolerate "no such volume" — means the registry was already empty
            # of state (fresh lab, never had a volume yet, etc.). Anything
            # else is a real failure.
            if label == "rm-volume" and ("No such volume" in stderr or "no such volume" in stderr):
                logger.info("clear %s: volume %s already absent — ok", service, volume)
                continue
            logger.error("clear %s failed at %s: cmd=%s stderr=%s", service, label, cmd, stderr)
            # Surface the failed command + stderr so the frontend can show a
            # useful error instead of a bare "HTTP 500". If start failed, the
            # registry will be left stopped — the message tells the user how
            # to recover by hand.
            recovery = (
                f"\nRecover by running on the host: docker compose up -d {service}"
                if label == "start"
                else ""
            )
            raise HTTPException(
                status_code=500,
                detail=(
                    f"{label} failed (exit {result.returncode}): "
                    f"{stderr or 'compose command failed'}{recovery}"
                ),
            )
    return {"ok": True, "registry": name, "volume": volume}


# ─── Ollama model manager ────────────────────────────────────────────────
# Lets workshop participants pull/list/delete local models from the GUI
# without dropping to a terminal. Ollama-only — cloud providers manage
# their own model lifecycles.

_OLLAMA_BASE = os.environ.get("OLLAMA_URL", "http://host.containers.internal:11434").rstrip("/")
# Defense-in-depth allowlist for tag names sent to /api/pull and /api/delete.
# Matches Ollama's own naming: family[:tag][/path]. Refuses paths with .., /
# attempts that escape, or whitespace.
_OLLAMA_TAG_RE = re.compile(r"^[a-zA-Z0-9._\-]+(?:[:/][a-zA-Z0-9._\-]+)*$")


@app.get("/api/ollama/installed")
async def ollama_installed():
    """List models the local Ollama daemon has already pulled."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as c:
            r = await c.get(f"{_OLLAMA_BASE}/api/tags")
            r.raise_for_status()
            return r.json()
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Ollama unreachable: {e}")


@app.post("/api/ollama/pull")
async def ollama_pull(request: Request):
    """Stream Ollama's /api/pull progress as Server-Sent Events.

    Each upstream JSONL line becomes one SSE `data:` frame. The connection
    closes when the pull finishes (status: "success") or when the client
    disconnects (we then close the upstream stream so Ollama aborts the
    in-flight download instead of finishing it on a closed socket)."""
    body = await request.json()
    name = (body.get("name") or "").strip()
    if not _OLLAMA_TAG_RE.match(name):
        raise HTTPException(status_code=400, detail=f"Invalid model name: {name!r}")

    async def event_stream():
        try:
            async with httpx.AsyncClient(timeout=None) as c:
                async with c.stream(
                    "POST",
                    f"{_OLLAMA_BASE}/api/pull",
                    json={"name": name, "stream": True},
                ) as resp:
                    if resp.status_code >= 400:
                        err = (await resp.aread()).decode("utf-8", errors="replace")
                        yield f"event: error\ndata: {json.dumps({'status': resp.status_code, 'detail': err})}\n\n"
                        return
                    async for line in resp.aiter_lines():
                        if not line.strip():
                            continue
                        yield f"data: {line}\n\n"
        except httpx.RequestError as e:
            yield f"event: error\ndata: {json.dumps({'detail': str(e)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.delete("/api/ollama/models/{name:path}")
async def ollama_delete(name: str):
    """Remove a locally pulled model."""
    if not _OLLAMA_TAG_RE.match(name):
        raise HTTPException(status_code=400, detail=f"Invalid model name: {name!r}")
    try:
        async with httpx.AsyncClient(timeout=10.0) as c:
            r = await c.request("DELETE", f"{_OLLAMA_BASE}/api/delete", json={"name": name})
            if r.status_code == 404:
                raise HTTPException(status_code=404, detail=f"Model not installed: {name}")
            r.raise_for_status()
            return {"deleted": name}
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Ollama unreachable: {e}")


def _detect_engine() -> str:
    """Auto-detect the container engine behind /var/run/docker.sock.

    Both engines mount the same path, but Docker answers GET /_ping with
    `Server: Docker/...` and Podman answers with `Server: Libpod/...`.
    Probing the socket is more reliable than trusting CONTAINER_ENGINE
    in .env, which can drift if the user switches engines without
    rerunning setup.

    Priority:
      1. CONTAINER_ENGINE_FORCE  (explicit override; testing the other path)
      2. Socket probe            (whoever's actually answering)
      3. CONTAINER_ENGINE env    (setup-script value)
      4. "docker"                (sane default)
    """
    forced = os.environ.get("CONTAINER_ENGINE_FORCE", "").strip().lower()
    if forced in ("docker", "podman"):
        return forced

    sock_path = "/var/run/docker.sock"
    try:
        import socket as _socket
        s = _socket.socket(_socket.AF_UNIX)
        s.settimeout(2.0)
        s.connect(sock_path)
        s.send(b"GET /_ping HTTP/1.0\r\nHost: x\r\n\r\n")
        chunks: list[bytes] = []
        for _ in range(4):
            chunk = s.recv(4096)
            if not chunk:
                break
            chunks.append(chunk)
        s.close()
        resp = b"".join(chunks).lower()
        if b"server: docker" in resp:
            return "docker"
        if b"server: libpod" in resp:
            return "podman"
    except OSError:
        pass

    fallback = os.environ.get("CONTAINER_ENGINE", "docker").strip().lower()
    return fallback or "docker"


_CONTAINER_ENGINE = _detect_engine()
logger.info("Detected container engine: %s", _CONTAINER_ENGINE)
_HOST_PROJECT_DIR = os.environ.get("HOST_PROJECT_DIR", "")


_ALLOWED_MCP_SERVICES = {"mcp-user", "mcp-gitea", "mcp-registry", "mcp-promotion", "mcp-runner"}


def _image_exists(service: str) -> bool:
    """Return True iff compose's built image for `service` exists locally.
    Compose names built images `<project>-<service>` so with `-p mcp-lab`
    that's `mcp-lab-mcp-user`, `mcp-lab-mcp-gitea`, etc.
    `docker image inspect` exits 0 if found, non-zero if not. We use docker
    here because the chat-ui container mounts the host docker socket — the
    same code path the mcp-control endpoint uses.
    """
    image_name = f"mcp-lab-{service}"
    try:
        result = subprocess.run(
            ["docker", "image", "inspect", image_name],
            capture_output=True, text=True, timeout=5,
        )
        return result.returncode == 0
    except Exception:
        # If docker itself is unreachable, treat as "preparing" rather than
        # blocking — the user can still navigate the UI.
        return False


def _prebuild_status(server_names: list[str]) -> dict[str, str]:
    """Map mcp-* service name → "ready" | "preparing" based on whether the
    compose-built image is on disk yet. Used by the chat-ui to label Start
    buttons during the post-setup background-build window."""
    out: dict[str, str] = {}
    for name in server_names:
        full = name if name.startswith("mcp-") else f"mcp-{name}"
        if full not in _ALLOWED_MCP_SERVICES:
            continue
        out[full] = "ready" if _image_exists(full) else "preparing"
    return out


@app.get("/api/mcp-status")
async def mcp_status():
    try:
        servers = await check_servers()
        total = sum(s["tool_count"] for s in servers)
        online = sum(1 for s in servers if s["status"] == "online")
        # The chat-ui shows a "preparing…" badge on Start buttons whose image
        # isn't built yet. After 2-setup.sh kicks off background builds for
        # off-tier MCPs, those entries flip from "preparing" to "ready" as
        # each build finishes (typically within ~60s on first run).
        prebuild = _prebuild_status([s["name"] for s in servers])
        return {
            "servers": servers,
            "total_tools": total,
            "online_count": online,
            "engine": _CONTAINER_ENGINE,
            "host_project_dir": _HOST_PROJECT_DIR,
            "prebuild_status": prebuild,
        }
    except Exception as e:
        return {
            "servers": [],
            "total_tools": 0,
            "online_count": 0,
            "engine": _CONTAINER_ENGINE,
            "host_project_dir": _HOST_PROJECT_DIR,
            "prebuild_status": {},
            "error": str(e),
        }


_COMPOSE_FILES = [
    pathlib.Path("/app/docker-compose.yml"),
    pathlib.Path("/app/compose.yml"),
]


def _compose_file_args() -> list[str]:
    for p in _COMPOSE_FILES:
        if p.exists():
            return ["-f", str(p)]
    return []


@app.post("/api/mcp-control")
async def mcp_control(request: Request):
    body = await request.json()
    service = body.get("service", "")
    action = body.get("action", "")

    # Tolerate stripped names ("user", "gitea") because mcp_client.check_servers
    # returns names with the "mcp-" prefix removed (host.replace("mcp-", "")).
    # Callers reading from /api/mcp-status pass the stripped form straight
    # through; auto-restore the prefix so they don't have to know.
    if service not in _ALLOWED_MCP_SERVICES and f"mcp-{service}" in _ALLOWED_MCP_SERVICES:
        service = f"mcp-{service}"

    if service not in _ALLOWED_MCP_SERVICES:
        raise HTTPException(status_code=400, detail=f"Unknown service: {service}")
    if action not in ("start", "stop"):
        raise HTTPException(status_code=400, detail=f"Unknown action: {action}")

    # Pre-flight: if user clicks Start before the image is built (background
    # builds from 2-setup.sh take ~60s after the foreground "lab ready" message),
    # return a friendly 503 instead of a confusing compose error. Stop is
    # always safe to attempt — no image needed to stop a running container.
    if action == "start" and not _image_exists(service):
        raise HTTPException(
            status_code=503,
            detail=f"{service} is still preparing in the background. Try again in ~30s.",
        )

    # Always use "docker" CLI inside the container — the host socket is mounted
    # at /var/run/docker.sock regardless of whether the host uses Docker or Podman.
    base_cmd = ["docker", "compose", "-p", "mcp-lab"] + _compose_file_args()
    cmd = base_cmd + (["up", "-d", "--no-build", service] if action == "start" else ["stop", service])

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            raise HTTPException(status_code=500, detail=result.stderr.strip() or "compose command failed")
        return {"ok": True, "service": service, "action": action}
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="compose command timed out")


# Defense-in-depth: only allow probes against the lab's known ports.
# Prevents the chat-ui from being used as a port-scan reflector.
_PROBE_ALLOWLIST = re.compile(
    r"^http://(localhost|127\.0\.0\.1):"
    r"(3000|3001|5001|5002|8001|8002|8003|8004|8005|8006|8007|9080|9081|9082|11434)"
    r"(/.*)?$"
)

# Map localhost ports to Docker-internal hostnames so the probe works from
# inside the chat-ui container (where localhost != the host machine).
_PORT_TO_HOST = {
    "3000": "gitea:3000",
    "3001": "localhost:3001",       # chat-ui itself
    "5001": "registry-dev:5000",    # registry internal port is 5000
    "5002": "registry-prod:5000",
    "8001": "user-api:8001",
    "8002": "promotion-service:8002",
}

def _rewrite_probe_url(url: str) -> str:
    """Rewrite localhost:PORT URLs to Docker-internal hostnames."""
    import urllib.parse
    parsed = urllib.parse.urlparse(url)
    port = str(parsed.port) if parsed.port else ""
    internal = _PORT_TO_HOST.get(port)
    if internal:
        return url.replace(f"{parsed.hostname}:{parsed.port}", internal, 1)
    return url


@app.post("/api/probe")
async def probe_url(request: Request):
    body = await request.json()
    url = body.get("url", "").strip()
    if not _PROBE_ALLOWLIST.match(url):
        raise HTTPException(status_code=400, detail="URL not in allowlist (localhost only)")
    internal_url = _rewrite_probe_url(url)
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(internal_url)
        try:
            snippet = resp.json()
        except Exception:
            snippet = resp.text[:500]
        return {"status": resp.status_code, "body": snippet}
    except httpx.ConnectError:
        return {"status": 0, "body": "connection refused"}
    except httpx.TimeoutException:
        return {"status": 0, "body": "timed out"}


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
        return {
            "score": 0.0,
            "label": "Neutral",
            "source": "heuristic",
            "details": "No verifiable data in tool results"
        }

    ratio = matched / total_checks
    if ratio >= 0.8:
        label = "High"
        score = 0.9
    elif ratio >= 0.3:
        label = "Medium"
        score = 0.5
    else:
        label = "Low"
        score = 0.1

    return {
        "score": score,
        "label": f"{label} (Heuristic)",
        "source": "heuristic",
        "details": f"Reply references {matched}/{total_checks} data points from tool results"
    }


SYSTEM_PROMPT_BASE = """You are a helpful DevOps assistant. You have access to the tools listed below — use them when appropriate. Be concise in your responses and explain what you did after completing actions.

IMPORTANT:
1. You only have access to the tools listed below. Do not assume other tools exist, do not invent or guess additional tool names, and do not mention "MCP", "servers", "compose", "docker", or any infrastructure terms to the user.
2. If a request can't be satisfied by the listed tools, just say you can't do it — don't speculate about what's missing or how the user could enable more capabilities. The user is in charge of what tools you have; that's not your concern.
3. When creating resources (users, repos, etc.), you MUST ASK the user for required details (e.g., email, full name, role) if they are not provided. Do NOT guess or hallucinate these values.

{mcp_context}"""


# Vanilla helpful-assistant prompt used when ZERO MCP servers are online.
# This is the workshop's cold-open posture: the model knows nothing about MCP,
# acts like a normal chatbot, and either tries to help or admits it can't.
# That is exactly the contrast the workshop wants — without this, the model
# sees "MCP servers exist but are OFFLINE" in its system prompt and helpfully
# leaks that abstraction back to the user ("the user server is offline, run
# docker compose up -d mcp-user") which spoils the surprise of bringing the
# first MCP online.
VANILLA_SYSTEM_PROMPT = (
    "You are a helpful assistant. Answer the user's questions and have a "
    "normal conversation. Be honest about what you can and cannot do."
)


def _build_system_prompt(servers: list[dict], tools: list[dict]) -> str:
    """Build system prompt with live tool context.

    Two key principles, both driven by the workshop's pedagogy:

      1. When no MCP server is online → vanilla helpful-assistant prompt,
         no mention of MCP / tools / servers. The LLM behaves like any other
         chatbot and either tries to help or admits it can't.

      2. When one or more MCP servers ARE online → list ONLY the online ones
         (and ONLY their tools). Offline servers are never mentioned. The LLM
         must not learn that mcp-promotion exists until mcp-promotion is
         actually started — otherwise it'll happily explain to the user that
         "mcp-promotion is offline, run docker compose up -d mcp-promotion",
         which spoils every progressive-enablement reveal in the workshop.
    """
    online = [s for s in servers if s["status"] == "online"]
    if not online:
        return VANILLA_SYSTEM_PROMPT

    lines = ["Available tools (grouped by capability):"]
    for s in online:
        tool_names = ", ".join(s["tools"]) if s["tools"] else "none"
        lines.append(f"  - {s['tool_count']} tools: [{tool_names}]")
    if tools:
        lines.append(f"\nTotal tools available right now: {len(tools)}.")
    mcp_context = "\n".join(lines)
    return SYSTEM_PROMPT_BASE.format(mcp_context=mcp_context)


def _tools_for_llm(servers: list[dict], tools: list[dict]) -> list[dict]:
    """Hide every tool (including the synthetic list_mcp_servers meta-tool)
    from the LLM when no MCP server is online.

    Without this, the LLM can call list_mcp_servers, see the OFFLINE status of
    every server, and explain it to the user — defeating the cold-open. Once
    at least one server is online, the full tool list is exposed normally.
    The /api/tools endpoint and the lab dashboard still see the full list;
    only the LLM-facing slice is filtered.
    """
    if not any(s.get("status") == "online" for s in servers):
        return []
    return tools


@app.post("/api/chat")
async def chat(req: ChatRequest):
    try:
        if _hallucination_mode:
            # Hallucination Mode (soft gate): do NOT probe MCP servers and use
            # the permissive system prompt, but expose the synthetic
            # `enable_mcp_tools` meta-tool so the model has one explicit
            # escape hatch when the user asks for it. Prompt instructs the
            # model not to call the meta-tool unprompted, preserving the
            # gaslighting beat for unrelated questions.
            logger.info("Chat request (HALLUCINATION MODE): provider=%s",
                        _provider_config.get("provider"))
            sys_prompt = HALLUCINATION_SYSTEM_PROMPT + HALLUCINATION_ESCAPE_TOOL_HINT
            messages = [{"role": "system", "content": sys_prompt}]
            for msg in req.history:
                messages.append({"role": msg.role, "content": msg.content})
            messages.append({"role": "user", "content": req.message})

            escape_tool = get_local_tool("enable_mcp_tools")
            tools_for_provider = [escape_tool] if escape_tool else []

            provider = get_provider(_provider_config)
            result = await provider.chat(messages, tools_for_provider)

            usage_data = result.get("token_usage", {})
            # Surface any synthetic tool calls the model made (only
            # enable_mcp_tools is reachable here) so the UI's tool-call card
            # can render them. The flag may already be False at this point if
            # the callback fired mid-turn — that's fine; we still report this
            # particular response as having been served in Flying Blind.
            hallucination_tool_calls = [
                {"name": tc["name"], "arguments": tc["arguments"], "result": tc.get("result")}
                for tc in result.get("tool_calls", [])
            ]
            return ChatResponse(
                reply=result["reply"],
                tool_calls=hallucination_tool_calls,
                token_usage=TokenUsage(
                    input_tokens=usage_data.get("input_tokens", 0),
                    output_tokens=usage_data.get("output_tokens", 0),
                    total_tokens=usage_data.get("total_tokens", 0),
                ),
                confidence=ConfidenceResult(
                    score=0.0, label="Hallucination Mode",
                    source="hallucination",
                    details="Hallucination Mode is ON — only the enable_mcp_tools escape hatch is exposed; permissive prompt active.",
                ),
                hallucination_mode=True,
                provider=str(_provider_config.get("provider") or ""),
                model=str(_provider_config.get("model") or ""),
            )

        # Get available MCP tools and server status (grounded mode).
        try:
            servers = await check_servers()
            all_tools = await list_tools()
        except Exception as e:
            logger.error("Failed to fetch MCP tools: %s", e, exc_info=True)
            servers = []
            all_tools = []

        logger.info("Chat request: provider=%s, tools_count=%d, servers_online=%d",
                     _provider_config.get("provider"), len(all_tools),
                     sum(1 for s in servers if s.get("status") == "online"))

        # Build conversation with dynamic system prompt
        system_prompt = _build_system_prompt(servers, all_tools)
        messages = [{"role": "system", "content": system_prompt}]
        for msg in req.history:
            messages.append({"role": msg.role, "content": msg.content})
        messages.append({"role": "user", "content": req.message})

        # Call LLM. Tools are filtered to [] when no MCP server is online so
        # the cold-open posture (vanilla prompt + zero tools) is consistent.
        tools_for_llm = _tools_for_llm(servers, all_tools)
        provider = get_provider(_provider_config)
        result = await provider.chat(messages, tools_for_llm)

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
            confidence=ConfidenceResult(**verification),
            hallucination_mode=False,
            provider=str(_provider_config.get("provider") or ""),
            model=str(_provider_config.get("model") or ""),
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


@app.post("/api/chat-compare", response_model=CompareResponse)
async def chat_compare(req: CompareRequest):
    """Run the same prompt against two providers in parallel and return both
    panes' results so the audience can SEE the difference between a small
    local model and a frontier model on the same input.

    Pane configs may include an explicit api_key; if omitted, the env-resolved
    key is used. Per-pane errors are caught — one bad provider does not break
    the other pane. The response NEVER includes the api_keys (M2 leak guard
    applies here too).
    """
    import asyncio
    import time

    # Build the system prompt + tools list ONCE so both panes get a fair compare.
    try:
        servers = await check_servers()
        all_tools = await list_tools()
    except Exception as e:
        logger.error("compare: failed to fetch MCP tools: %s", e)
        servers, all_tools = [], []
    grounded_sys_prompt = _build_system_prompt(servers, all_tools)

    def _scrub_secrets(text: str, *keys: str) -> str:
        """Defense-in-depth: even if an SDK error stringifies a key, blank it."""
        out = text or ""
        for k in keys:
            if k:
                out = out.replace(k, "***")
        return out

    async def _run_pane(pane: PaneConfig) -> PaneResult:
        cfg = pane.model_dump(exclude={"hallucination_mode"})
        if not cfg.get("api_key"):
            cfg["api_key"] = _resolve_api_key(cfg["provider"])
        if not cfg.get("base_url"):
            cfg["base_url"] = os.environ.get(
                "OLLAMA_URL", "http://host.containers.internal:11434"
            )
        if not cfg.get("model"):
            cfg["model"] = ""

        # Per-pane Hallucination Mode (M9): permissive prompt, tools=[]
        # so the audience can put grounded LEFT next to hallucinating RIGHT
        # with the same provider — sharper teaching contrast.
        if pane.hallucination_mode:
            sys_prompt = HALLUCINATION_SYSTEM_PROMPT
            tools_for_pane: list = []
        else:
            sys_prompt = grounded_sys_prompt
            # Same cold-open scrub as the single-pane handler: zero MCP online → zero tools.
            tools_for_pane = _tools_for_llm(servers, all_tools)

        messages = [{"role": "system", "content": sys_prompt},
                    {"role": "user", "content": req.message}]

        t0 = time.monotonic()
        try:
            provider = get_provider(cfg)
            result = await provider.chat(messages, tools_for_pane)
            elapsed = int((time.monotonic() - t0) * 1000)
            return PaneResult(
                reply=result.get("reply", ""),
                tool_calls=[
                    ToolCall(
                        name=tc.get("name", ""),
                        arguments=tc.get("arguments", {}),
                        result=tc.get("result"),
                    ) for tc in result.get("tool_calls", [])
                ],
                token_usage=TokenUsage(**result.get("token_usage", {})),
                elapsed_ms=elapsed,
                provider=cfg["provider"],
                model=cfg.get("model") or "",
            )
        except Exception as e:
            return PaneResult(
                reply="",
                error=_scrub_secrets(str(e), cfg.get("api_key") or ""),
                elapsed_ms=int((time.monotonic() - t0) * 1000),
                provider=cfg.get("provider", ""),
                model=cfg.get("model") or "",
            )

    left, right = await asyncio.gather(_run_pane(req.left), _run_pane(req.right))
    return CompareResponse(left=left, right=right)


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
            status = "Verified"
            score = 1.0
        elif "HALLUCINATION" in first_line:
            status = "Hallucination"
            score = 0.0
        else:
            status = "Uncertain"
            score = 0.5

        lines = reply_text.strip().split("\n")
        explanation = "\n".join(lines[1:]).strip() if len(lines) > 1 else reply_text

        usage_data = result.get("token_usage", {})
        return VerifyResponse(
            confidence=ConfidenceResult(
                score=score,
                label=f"{status} (LLM)",
                source="llm",
                details=explanation
            ),
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
