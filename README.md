# MCP DevOps Workshop Lab

A hands-on workshop that teaches how the **Model Context Protocol (MCP)** transforms DevOps tooling by acting as a unified control, translation, and policy plane. Learners experience the friction of raw API interaction, then progressively enable MCP tools to see how structured tool calling eliminates complexity.

## Learning Objectives

1. Understand why LLMs struggle with multi-system tool calling without structure
2. Experience the friction of manual REST API interaction across heterogeneous systems
3. See how MCP provides a protocol layer that abstracts authentication, translation, and policy
4. Build intuition for progressive capability disclosure via feature switches
5. Compare local open-source models (Ollama) with commercial APIs for tool calling quality

## Architecture

```
                         +------------------+
                         |   Browser :3001  |
                         +--------+---------+
                                  |
                         +--------v---------+
                         |    Chat UI       |
                         |  (FastAPI + JS)  |
                         +--------+---------+
                                  |  JSON-RPC / streamable-http
                         +--------v---------+
                    +--->|   MCP Server     |<---+
                    |    |  :8003 (FastMCP) |    |
                    |    +--+-----+-----+--+    |
                    |       |     |     |       |
              +-----v--+ +--v---+ +--v------+ +-v-----------+
              |User API| |Gitea | |Registries| |Promotion Svc|
              | :8001  | |:3000 | |:5001/5002| |   :8002     |
              +--------+ +------+ +----------+ +-------------+
```

**8 services** on a single Docker bridge network (`mcp-lab-net`):

| Service | Port | Role |
|---------|------|------|
| **Chat UI** | 3001 | Web chat interface (any LLM provider) |
| **MCP Server** | 8003 | 19 MCP tools via streamable-http transport |
| **User API** | 8001 | User CRUD (FastAPI + SQLite) |
| **Gitea** | 3000 | Git repository hosting |
| **Registry Dev** | 5001 | Container image registry (development) |
| **Registry Prod** | 5002 | Container image registry (production) |
| **Promotion Service** | 8002 | Image promotion with role-based policy checks |
| **Bootstrap** | -- | One-shot init (Gitea admin, sample repos, seed data) |

## MCP Tools (19 total, 4 categories)

| Category | Switch | Tools | Capabilities |
|----------|--------|-------|-------------|
| **User Management** | `USER_MCP_ENABLED` | 6 | list, get, search, create, update, deactivate users |
| **Git / Gitea** | `GITEA_MCP_ENABLED` | 7 | repos, branches, file read/write |
| **Container Registry** | `REGISTRY_MCP_ENABLED` | 3 | list images, tags, manifests (dev + prod) |
| **Image Promotion** | `PROMOTION_MCP_ENABLED` | 3 | promote images, list/check promotion history |

All tools start **disabled**. Flip switches in `.env` and restart to enable them incrementally.

## Prerequisites

- **Podman Desktop** (or Docker Desktop) installed and running
- **(Optional)** [Ollama](https://ollama.ai) with a model pulled: `ollama pull llama3.1:8b`
- **(Optional)** API key for OpenAI, Anthropic, or Google Gemini

## Quick Start

```bash
# Clone and enter the repo
git clone https://github.com/stratione/mcp-lab.git
cd mcp-lab

# One-command setup: creates .env, starts services, grabs Gitea token
./scripts/setup.sh

# Push a sample image to the dev registry
podman pull alpine:3.19
podman tag alpine:3.19 localhost:5001/sample-app:v1.0.0
podman push localhost:5001/sample-app:v1.0.0

# Open the Chat UI
open http://localhost:3001
```

The setup script will:
1. Create `.env` from `.env.example` and `.env.secrets` from `.env.secrets.example`
2. Run `podman compose up -d` (all 8 services)
3. Wait for bootstrap to finish and extract the Gitea API token
4. Inject the token into `.env` automatically
5. Restart the MCP server so the token takes effect

## Environment Files

The environment is split into two files for screen-sharing safety:

| File | Contents | Safe to show? |
|------|----------|---------------|
| `.env` | Feature switches, LLM provider, Ollama URL, Gitea token | Yes |
| `.env.secrets` | API keys (Anthropic, OpenAI, Google) | **No** |

```bash
# .env — open this on screen during the workshop
USER_MCP_ENABLED=false       # Flip to true to enable user tools
GITEA_MCP_ENABLED=false      # Flip to true to enable Gitea tools
REGISTRY_MCP_ENABLED=false   # Flip to true to enable registry tools
PROMOTION_MCP_ENABLED=false  # Flip to true to enable promotion tools

LLM_PROVIDER=ollama          # Options: ollama, openai, anthropic, google
LLM_MODEL=llama3.1:8b
```

```bash
# .env.secrets — keep this file private
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...
```

After changing switches, restart the MCP server:
```bash
podman compose restart mcp-server
```

## LLM Providers

| Provider | Model | Cost | Notes |
|----------|-------|------|-------|
| **Ollama** | `llama3.1:8b` | Free / local | Default. Intentionally struggles with tool calling |
| **OpenAI** | `gpt-4o` | API key | Strong tool calling |
| **Anthropic** | `claude-sonnet-4-5-20250929` | API key | Strong tool calling |
| **Google** | `gemini-2.0-flash` | API key | Strong tool calling |

The workshop intentionally starts with Ollama so students experience a weaker model's tool-calling limitations before seeing MCP improve the experience.

## Workshop Phases

### Phase 1: The Struggle (All MCP switches OFF)

Students interact with the Chat UI using Ollama with zero MCP tools. The LLM hallucinates tool calls, invents users, and cannot actually reach any backend system. This is the "before" picture.

**Key teaching moment:** LLMs alone cannot reliably interact with external systems without structured protocols.

### Phase 2: Progressive Enablement (Flip switches one by one)

Enable tools incrementally in `.env`:

```bash
USER_MCP_ENABLED=true        # 6 tools
GITEA_MCP_ENABLED=true       # +7 tools (13 total)
REGISTRY_MCP_ENABLED=true    # +3 tools (16 total)
PROMOTION_MCP_ENABLED=true   # +3 tools (19 total)
```

Each restart adds capabilities. Students see the tool count grow in the Chat UI header.

**Key teaching moment:** MCP provides progressive disclosure. Feature switches control the blast radius.

### Phase 3: Intent-Based DevOps (All 19 tools ON)

Students express complex multi-system intents in natural language:

> "Onboard a new developer named Charlie, create their user account, set up a Git repo called charlie-service, then promote sample-app:v1.0.0 to prod with Charlie as the promoter."

The agent orchestrates tool calls across all four backend systems, handles policy rejections (Charlie is a developer, not a reviewer), and reports results.

**Key teaching moment:** MCP as a control plane enables translation, credential injection, policy enforcement, and audit — all invisible to the user.

## Detailed Lab Guides

| Guide | Description |
|-------|-------------|
| [Lab Guide](docs/LAB_GUIDE.md) | Full workshop walkthrough |
| [Phase 1](docs/PHASE_1.md) | Manual API interaction (curl, friction) |
| [Phase 2](docs/PHASE_2.md) | Introducing MCP tools incrementally |
| [Phase 3](docs/PHASE_3.md) | Intent-based multi-system workflows |
| [Endpoints](ENDPOINTS.md) | Complete API reference with curl examples |

## Claude Code (stdio mode)

The MCP server also supports stdio transport for direct use with Claude Code:

```bash
cd mcp-server && pip install -r requirements.txt
```

See `config/mcp/claude-code-config.json` for configuration reference.

## Managing Services

```bash
# Restart all services
podman compose restart

# Restart just the MCP server (after flipping switches)
podman compose restart mcp-server

# View logs
podman compose logs -f chat-ui

# Full stop/start
podman compose down && podman compose up -d

# Nuclear reset (wipes all data volumes)
podman compose down -v
```

## Conference Submission

See [docs/CONFERENCE.md](docs/CONFERENCE.md) for the workshop proposal suitable for conference review boards.

## License

MIT
