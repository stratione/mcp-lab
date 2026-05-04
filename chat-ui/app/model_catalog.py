"""Per-provider model catalog with live discovery + curated fallback.

Powers GET /api/models in main.py, which feeds the chat-ui's model
dropdown. Each provider exposes:

  - live_fetch():     hits the provider's list-models endpoint.
                      Returns [] on any error (no key, network, 4xx, 5xx).
  - fallback():       hand-curated list pulled from each provider's docs.
                      Refresh these every few months — model lineups churn.
  - auto_default():   the model "Auto (recommended)" resolves to.

Each model entry is a plain dict:
  {"id": "<api id>", "label": "<human label>", "supports_tools": bool,
   "installed": bool | None, "recommended": bool}

"installed" is meaningful only for Ollama (locally pulled vs. not).
"recommended" tags models we've validated in this lab — the chat-ui
renders ★ next to them in the dropdown so workshop attendees can pick
a known-reliable option without trial-and-error.
"""
from __future__ import annotations

import os
from typing import Any

import httpx


_OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://host.containers.internal:11434")


# ─── Ollama ──────────────────────────────────────────────────────────────

# Curated catalog. Every entry below is confirmed tools-capable via Ollama's
# "tools" filter (https://ollama.com/search?c=tools). The lab is fundamentally
# about MCP tool calling, so models that can't tool-call don't earn a slot —
# they'd just produce raw-JSON-text "tool calls" that confuse first-time
# attendees. Refresh from the link above if the lineup drifts.
_OLLAMA_CATALOG: list[dict[str, Any]] = [
    {"id": "llama3.1:8b",   "label": "Llama 3.1 8B (default)",       "supports_tools": True, "recommended": True},
    {"id": "llama3.1:70b",  "label": "Llama 3.1 70B (large)",        "supports_tools": True, "recommended": False},
    {"id": "llama3.2:3b",   "label": "Llama 3.2 3B (small/fast)",    "supports_tools": True, "recommended": False},
    {"id": "qwen2.5:7b",    "label": "Qwen 2.5 7B",                  "supports_tools": True, "recommended": False},
    {"id": "mistral-nemo",  "label": "Mistral Nemo 12B",             "supports_tools": True, "recommended": False},
    {"id": "command-r-plus","label": "Cohere Command R+",            "supports_tools": True, "recommended": False},
]


async def _ollama_installed() -> set[str]:
    """Return the set of model tags the local Ollama daemon has pulled."""
    try:
        async with httpx.AsyncClient(timeout=3.0) as c:
            r = await c.get(f"{_OLLAMA_URL.rstrip('/')}/api/tags")
            r.raise_for_status()
            data = r.json()
            return {m.get("name", "") for m in data.get("models", []) if m.get("name")}
    except Exception:
        return set()


async def ollama_models() -> list[dict[str, Any]]:
    """Catalog with installed flags filled in. Installed models sort first."""
    installed = await _ollama_installed()
    catalog = [{**m, "installed": m["id"] in installed} for m in _OLLAMA_CATALOG]
    # Surface any installed model that isn't in the curated list.
    extras = installed - {m["id"] for m in _OLLAMA_CATALOG}
    for tag in sorted(extras):
        catalog.append({"id": tag, "label": tag, "supports_tools": True, "installed": True, "recommended": False})
    catalog.sort(key=lambda m: (not m["installed"], m["id"]))
    return catalog


def ollama_auto() -> str:
    return "llama3.1:8b"


# ─── OpenAI ──────────────────────────────────────────────────────────────

# Refresh against https://platform.openai.com/docs/models when this drifts.
# Knowledge cutoff: Jan 2026. The live /v1/models call replaces this list
# whenever an API key is present, so this only kicks in for keyless previews.
# Recommended OpenAI models for this lab. gpt-4.1-mini is the workhorse pick:
# transcripts confirm it executes the build → scan → promote → deploy chain
# reliably at ~1/5 the cost of gpt-4o. gpt-5-mini is the recommended default
# for users on the newer GPT-5 line.
_OPENAI_RECOMMENDED = {"gpt-5-mini", "gpt-4.1-mini"}

_OPENAI_FALLBACK: list[dict[str, Any]] = [
    {"id": "gpt-5",          "label": "GPT-5",                   "supports_tools": True},
    {"id": "gpt-5-mini",     "label": "GPT-5 mini",              "supports_tools": True},
    {"id": "gpt-5-nano",     "label": "GPT-5 nano",              "supports_tools": True},
    {"id": "gpt-4.1",        "label": "GPT-4.1",                 "supports_tools": True},
    {"id": "gpt-4.1-mini",   "label": "GPT-4.1 mini",            "supports_tools": True},
    {"id": "gpt-4o",         "label": "GPT-4o",                  "supports_tools": True},
    {"id": "gpt-4o-mini",    "label": "GPT-4o mini",             "supports_tools": True},
    {"id": "o4-mini",        "label": "o4-mini (reasoning)",     "supports_tools": True},
    {"id": "o3",             "label": "o3 (reasoning)",          "supports_tools": True},
    {"id": "o3-mini",        "label": "o3-mini (reasoning)",     "supports_tools": True},
    {"id": "o1",             "label": "o1 (reasoning)",          "supports_tools": True},
]

_OPENAI_AUTO = "gpt-5-mini"


async def openai_models(api_key: str) -> list[dict[str, Any]]:
    if not api_key:
        return [{**m, "installed": None, "recommended": m["id"] in _OPENAI_RECOMMENDED} for m in _OPENAI_FALLBACK]
    try:
        async with httpx.AsyncClient(timeout=5.0) as c:
            r = await c.get(
                "https://api.openai.com/v1/models",
                headers={"Authorization": f"Bearer {api_key}"},
            )
            r.raise_for_status()
            data = r.json().get("data", [])
            # Only show chat-completions-eligible families; everything else
            # (whisper, dall-e, embeddings) just confuses workshop attendees.
            keep = [
                m for m in data
                if any(m["id"].startswith(p) for p in ("gpt-", "o1", "o3", "chatgpt"))
                and "embedding" not in m["id"]
                and "tts" not in m["id"]
                and "dall-e" not in m["id"]
                and "whisper" not in m["id"]
            ]
            keep.sort(key=lambda m: m["id"])
            return [
                {"id": m["id"], "label": m["id"], "supports_tools": True, "installed": None, "recommended": m["id"] in _OPENAI_RECOMMENDED}
                for m in keep
            ] or [{**m, "installed": None, "recommended": m["id"] in _OPENAI_RECOMMENDED} for m in _OPENAI_FALLBACK]
    except Exception:
        return [{**m, "installed": None, "recommended": m["id"] in _OPENAI_RECOMMENDED} for m in _OPENAI_FALLBACK]


def openai_auto() -> str:
    return _OPENAI_AUTO


# ─── Anthropic ───────────────────────────────────────────────────────────

# Refresh against https://docs.anthropic.com/en/docs/about-claude/models when
# this drifts. Knowledge cutoff: Jan 2026. The live /v1/models call replaces
# this whenever an API key is present, so this is only for keyless previews.
# Recommended Anthropic picks. Haiku 4.5 is the workshop sweet spot: fast,
# cheap, and Anthropic explicitly tuned it for agent / tool-use loops.
# Sonnet 4.6 stays starred for users who want extra reliability on the
# capstone chain.
_ANTHROPIC_RECOMMENDED = {"claude-haiku-4-5-20251001", "claude-sonnet-4-6"}

_ANTHROPIC_FALLBACK: list[dict[str, Any]] = [
    {"id": "claude-opus-4-7",          "label": "Claude Opus 4.7 (most capable)", "supports_tools": True},
    {"id": "claude-sonnet-4-6",        "label": "Claude Sonnet 4.6 (balanced)",   "supports_tools": True},
    {"id": "claude-haiku-4-5-20251001","label": "Claude Haiku 4.5 (fast)",        "supports_tools": True},
    {"id": "claude-sonnet-4-5-20250929","label": "Claude Sonnet 4.5",             "supports_tools": True},
    {"id": "claude-opus-4-1-20250805", "label": "Claude Opus 4.1",                "supports_tools": True},
]

_ANTHROPIC_AUTO = "claude-sonnet-4-6"


async def anthropic_models(api_key: str) -> list[dict[str, Any]]:
    if not api_key:
        return [{**m, "installed": None, "recommended": m["id"] in _ANTHROPIC_RECOMMENDED} for m in _ANTHROPIC_FALLBACK]
    try:
        async with httpx.AsyncClient(timeout=5.0) as c:
            r = await c.get(
                "https://api.anthropic.com/v1/models",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                },
            )
            r.raise_for_status()
            data = r.json().get("data", [])
            data.sort(key=lambda m: m["id"], reverse=True)  # newest first
            return [
                {
                    "id": m["id"],
                    "label": m.get("display_name", m["id"]),
                    "supports_tools": True,
                    "installed": None,
                    "recommended": m["id"] in _ANTHROPIC_RECOMMENDED,
                }
                for m in data
            ] or [{**m, "installed": None, "recommended": m["id"] in _ANTHROPIC_RECOMMENDED} for m in _ANTHROPIC_FALLBACK]
    except Exception:
        return [{**m, "installed": None, "recommended": m["id"] in _ANTHROPIC_RECOMMENDED} for m in _ANTHROPIC_FALLBACK]


def anthropic_auto() -> str:
    return _ANTHROPIC_AUTO


# ─── Google Gemini ───────────────────────────────────────────────────────

# Refresh against https://ai.google.dev/gemini-api/docs/models when this
# drifts. Knowledge cutoff: Jan 2026. The live models.list call replaces
# this whenever an API key is present, so this is only for keyless previews.
# Recommended Gemini pick. Workshop transcripts caught flash + flash-lite
# fumbling on chained tool calls (denying tools they were given, mistaking
# state); pro is the consistent choice for the SDLC walkthrough.
_GOOGLE_RECOMMENDED = {"gemini-2.5-pro"}

_GOOGLE_FALLBACK: list[dict[str, Any]] = [
    {"id": "gemini-2.5-pro",         "label": "Gemini 2.5 Pro (most capable)",  "supports_tools": True},
    {"id": "gemini-2.5-flash",       "label": "Gemini 2.5 Flash (balanced)",    "supports_tools": True},
    {"id": "gemini-2.5-flash-lite",  "label": "Gemini 2.5 Flash Lite (cheap)",  "supports_tools": True},
    {"id": "gemini-2.0-flash",       "label": "Gemini 2.0 Flash",               "supports_tools": True},
    {"id": "gemini-2.0-pro",         "label": "Gemini 2.0 Pro",                 "supports_tools": True},
    {"id": "gemini-1.5-pro",         "label": "Gemini 1.5 Pro (legacy)",        "supports_tools": True},
]

_GOOGLE_AUTO = "gemini-2.5-flash"


async def google_models(api_key: str) -> list[dict[str, Any]]:
    if not api_key:
        return [{**m, "installed": None, "recommended": m["id"] in _GOOGLE_RECOMMENDED} for m in _GOOGLE_FALLBACK]
    try:
        async with httpx.AsyncClient(timeout=5.0) as c:
            r = await c.get(
                "https://generativelanguage.googleapis.com/v1beta/models",
                params={"key": api_key},
            )
            r.raise_for_status()
            data = r.json().get("models", [])
            keep = [
                m for m in data
                if "generateContent" in (m.get("supportedGenerationMethods") or [])
                and m["name"].startswith("models/gemini-")
            ]
            keep.sort(key=lambda m: m["name"], reverse=True)
            return [
                {
                    "id": m["name"].removeprefix("models/"),
                    "label": m.get("displayName") or m["name"].removeprefix("models/"),
                    "supports_tools": True,
                    "installed": None,
                    "recommended": m["name"].removeprefix("models/") in _GOOGLE_RECOMMENDED,
                }
                for m in keep
            ] or [{**m, "installed": None, "recommended": m["id"] in _GOOGLE_RECOMMENDED} for m in _GOOGLE_FALLBACK]
    except Exception:
        return [{**m, "installed": None, "recommended": m["id"] in _GOOGLE_RECOMMENDED} for m in _GOOGLE_FALLBACK]


def google_auto() -> str:
    return _GOOGLE_AUTO


# ─── Pretend (demo) ──────────────────────────────────────────────────────

def pretend_models() -> list[dict[str, Any]]:
    return [
        {"id": "demo", "label": "Demo (no key needed)", "supports_tools": False, "installed": True, "recommended": False}
    ]


def pretend_auto() -> str:
    return "demo"


# ─── Public dispatch ─────────────────────────────────────────────────────

async def list_models(provider: str, api_key: str = "") -> dict[str, Any]:
    if provider == "ollama":
        models = await ollama_models()
        auto = ollama_auto()
    elif provider == "openai":
        models = await openai_models(api_key)
        auto = openai_auto()
    elif provider == "anthropic":
        models = await anthropic_models(api_key)
        auto = anthropic_auto()
    elif provider == "google":
        models = await google_models(api_key)
        auto = google_auto()
    elif provider == "pretend":
        models = pretend_models()
        auto = pretend_auto()
    else:
        models = []
        auto = ""
    return {
        "provider": provider,
        "default": "auto",
        "auto_resolves_to": auto,
        "models": models,
    }


def resolve_auto(provider: str) -> str:
    """Map a sentinel 'auto' choice to the provider's recommended model id."""
    return {
        "ollama":    ollama_auto(),
        "openai":    openai_auto(),
        "anthropic": anthropic_auto(),
        "google":    google_auto(),
        "pretend":   pretend_auto(),
    }.get(provider, "")
