# MCP DevOps Workshop Lab

A hands-on lab that demonstrates how the **Model Context Protocol (MCP)** acts as a control, translation, and policy plane across DevOps systems. Learners experience friction without MCP, configure it incrementally, then use intent-based interaction through any LLM.

## Prerequisites

- Podman Desktop installed and running
- (Optional) [Ollama](https://ollama.ai) installed with a model pulled (`ollama pull llama3.1`)
- (Optional) API key for OpenAI, Anthropic, or Google Gemini

## Quick Start

```bash
# One-command setup: creates .env, starts services, grabs the Gitea token
./scripts/setup.sh

# Push a sample image to the dev registry
podman pull alpine:3.19
podman tag alpine:3.19 localhost:5001/sample-app:v1.0.0
podman push localhost:5001/sample-app:v1.0.0

# Open the Chat UI
open http://localhost:3001
```

The setup script will:
1. Create `.env` from `.env.example` (if it doesn't exist)
2. Run `podman compose up -d`
3. Wait for bootstrap to finish and grab the Gitea API token
4. Inject the token into your `.env` file automatically
5. Restart the MCP server so the token is available

All MCP feature switches start **disabled** so you can enable them incrementally as you progress through the lab phases.

## Architecture

```
  Browser (:3001) -> Chat UI -> MCP Server (:8003) -> User API (:8001)
                                                    -> Gitea (:3000)
                                                    -> Registries (:5001/:5002)
                                                    -> Promotion Svc (:8002)
```

## Service Map

| Service | Port | Description |
|---------|------|-------------|
| User API | 8001 | User CRUD (FastAPI + SQLite) |
| Gitea | 3000 | Git hosting (repos, branches, files) |
| Registry Dev | 5001 | Container image registry (dev) |
| Registry Prod | 5002 | Container image registry (prod) |
| Promotion Service | 8002 | Image promotion with policy checks |
| MCP Server | 8003 | MCP tools (HTTP/streamable-http transport) |
| Chat UI | 3001 | Web chat interface (any LLM provider) |

## LLM Providers

The chat UI supports multiple LLM backends:

- **Ollama** (free, local) — install from ollama.ai, pull a model like `llama3.1`
- **OpenAI** — requires API key, uses `gpt-4o` by default
- **Anthropic** — requires API key, uses `claude-sonnet-4-5-20250929` by default
- **Google Gemini** — requires API key, uses `gemini-2.0-flash` by default

Configure in `.env`:
```env
LLM_PROVIDER=ollama          # Options: ollama, openai, anthropic, google
LLM_API_KEY=your-api-key     # Required for openai/anthropic/google
LLM_MODEL=                   # Optional: override default model
```

## Feature Switches

MCP tools start disabled. Enable them incrementally in `.env` as you progress through the lab:

```env
GITEA_MCP_ENABLED=false       # Git repo management tools (7 tools)
REGISTRY_MCP_ENABLED=false    # Container registry tools (3 tools)
PROMOTION_MCP_ENABLED=false   # Image promotion tools (3 tools)
```

User management tools (6 tools) are always on. With all switches enabled, 19 tools are available.

After changing any switch, restart the MCP server:
```bash
podman compose restart mcp-server
```

## Managing Services

Restart all services:
```bash
podman compose restart
```

Restart a specific service:
```bash
podman compose restart <service-name>
```

Available services: `chat-ui`, `mcp-server`, `user-api`, `gitea`, `registry-dev`, `registry-prod`, `promotion-service`

Full stop/start cycle:
```bash
podman compose down
podman compose up -d
```

## Claude Code (stdio mode)

The MCP server also supports stdio transport for use with Claude Code:

1. Install dependencies: `cd mcp-server && pip install -r requirements.txt`
2. See `config/mcp/claude-code-config.json` for reference configuration
3. Update the paths and Gitea token, then add to your Claude Code MCP settings

## Lab Guide

See `docs/LAB_GUIDE.md` for the full workshop walkthrough.

| Phase | Description |
|-------|-------------|
| [Phase 1](docs/PHASE_1.md) | Manual API interaction (friction) |
| [Phase 2](docs/PHASE_2.md) | Introducing MCP — enable tools incrementally |
| [Phase 3](docs/PHASE_3.md) | Intent-based DevOps — multi-system workflows |

## Cleanup

```bash
podman compose down -v
```

This removes all containers and data volumes.
