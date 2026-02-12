# MCP DevOps Workshop Lab

A hands-on workshop that teaches how the **Model Context Protocol (MCP)** transforms DevOps tooling by acting as a unified control, translation, and policy plane. Learners experience the friction of raw API interaction, then progressively enable MCP tools to see how structured tool calling eliminates complexity.

---

## Table of Contents

- [System Requirements](#system-requirements)
  - [Disk Breakdown](#disk-breakdown)
  - [Ollama (Install Before the Workshop)](#ollama-install-before-the-workshop)
- [Learning Objectives](#learning-objectives)
- [Architecture](#architecture)
  - [Chat UI Features](#chat-ui-features)
- [Quick Start](#quick-start)
- [MCP On/Off — Quick Toggle](#mcp-onoff--quick-toggle)
- [Environment Configuration](#environment-configuration)
- [LLM Providers](#llm-providers)
- [Workshop Lab Guide](#workshop-lab-guide)
  - [Phase 1: Manual Operations (Without MCP)](#phase-1-manual-operations-without-mcp)
  - [Phase 2: Introducing MCP](#phase-2-introducing-mcp)
  - [Phase 3: Intent-Based DevOps (Full MCP)](#phase-3-intent-based-devops-full-mcp)
- [MCP Tools Reference](#mcp-tools-reference)
- [API Endpoints Reference](#api-endpoints-reference)
- [Scripts Reference](#scripts-reference)
- [Managing Services](#managing-services)
- [Troubleshooting](#troubleshooting)
- [Claude Code (stdio mode)](#claude-code-stdio-mode)
- [Workshop Proposal](#workshop-proposal)

---

## System Requirements

**Run this before the workshop to verify your machine is ready:**

```bash
./scripts/0-preflight.sh
```

The preflight script checks everything below and prints install instructions if anything is missing.

### Minimum Hardware

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| RAM | 8 GB | 16 GB |
| CPU | 4 cores | 8+ cores |
| Disk (without Ollama) | 2 GB free | 4 GB free |
| Disk (with Ollama) | 8 GB free | 10 GB free |
| OS | macOS 12+, Linux, Windows (WSL2) | macOS 14+ or Ubuntu 22+ |

### Disk Breakdown

| Component | Size |
|-----------|------|
| Container images (all services) | ~650 MB |
| Container runtime + volumes | ~150 MB |
| Ollama `llama3.1:8b` model | ~4.9 GB |
| **Total without Ollama** | **~1 GB** |
| **Total with Ollama** | **~6 GB** |

### Required Software

You need **one** of these container runtimes:

**Option A — Docker Desktop**

Download and install from https://www.docker.com/products/docker-desktop — no extra setup needed.

**Option B — Podman**

```bash
# macOS
brew install podman podman-desktop docker-compose
podman machine init
podman machine start

# Ubuntu/Debian
sudo apt-get install -y podman docker-compose

# Fedora/RHEL
sudo dnf install -y podman docker-compose
```

> **Note:** All `docker compose` commands in this guide work identically with `docker compose`. The setup and teardown scripts auto-detect your engine.

### Ollama (Install Before the Workshop)

The workshop starts with [Ollama](https://ollama.ai) — a free local LLM that runs without API keys. **Install and pull the model before arriving** so you're not waiting on a 4.9 GB download during the lab:

```bash
# macOS
brew install ollama
ollama serve &
ollama pull llama3.1:8b    # ~4.9 GB download

# Linux
curl -fsSL https://ollama.ai/install.sh | sh
ollama pull llama3.1:8b
```

> **Note:** Ollama must be running on your host machine before starting the lab (`ollama serve`). The `0-preflight.sh` script will check for this.

**Alternative: Cloud LLM only (no Ollama).** If you don't want to install Ollama, add an API key to `.env.secrets` for OpenAI, Anthropic, or Google instead (see [LLM Providers](#llm-providers)). This skips the ~4.9 GB model download but requires a paid API key.

---

## Learning Objectives

1. Understand why LLMs struggle with multi-system tool calling without structure
2. Experience the friction of manual REST API interaction across heterogeneous systems
3. See how MCP provides a protocol layer that abstracts authentication, translation, and policy
4. Build intuition for progressive capability disclosure by starting/stopping independent MCP servers
5. Compare local open-source models (Ollama) with commercial APIs for tool calling quality

---

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
                    +-------------+-------------+
                    |             |             |             |
             +------v-----+ +----v------+ +----v-------+ +--v-----------+
             | mcp-user   | | mcp-gitea | |mcp-registry| |mcp-promotion |
             |   :8003    | |   :8004   | |   :8005    | |    :8006     |
             +------+-----+ +----+------+ +----+-------+ +--+-----------+
                    |             |             |             |
              +-----v--+   +-----v-+   +-------v--+   +-----v--------+
              |User API|   |Gitea  |   |Registries|   |Promotion Svc |
              | :8001  |   |:3000  |   |:5001/5002|   |   :8002      |
              +--------+   +-------+   +----------+   +--------------+
```

### Chat UI Features

The web-based Chat UI (http://localhost:3001) includes:

- **Multi-provider support** — switch between Ollama, OpenAI, Anthropic, and Google Gemini from the UI
- **MCP status panel** — click the MCP strip bar to see which servers are online/offline and their tools
- **Tool call cards** — every MCP tool call shows as a collapsible card with arguments and results
- **Hallucination detection** — automatic heuristic badge (verified/uncertain/unverified) on every response
- **LLM verification** — on-demand "Verify with LLM" button for deeper fact-checking against tool results
- **Token tracking** — per-turn and session-wide token counter
- **Copy button** — hover over any assistant message to copy the prompt + response for debugging
- **Server-side chat history** — chat is persisted in a Docker volume (not browser localStorage), so tearing down the lab wipes all data cleanly
- **Quick reference** — click the `?` button for URLs, credentials, and commands

**11 services** on a single container network (`mcp-lab-net`):

| Service | Port | Role |
|---------|------|------|
| **Chat UI** | 3001 | Web chat interface — aggregates tools from all MCP servers |
| **mcp-user** | 8003 | 6 user management MCP tools (start on demand) |
| **mcp-gitea** | 8004 | 7 Git/Gitea MCP tools (start on demand) |
| **mcp-registry** | 8005 | 3 container registry MCP tools (start on demand) |
| **mcp-promotion** | 8006 | 3 image promotion MCP tools (start on demand) |
| **User API** | 8001 | User CRUD (FastAPI + SQLite) |
| **Gitea** | 3000 | Git repository hosting |
| **Registry Dev** | 5001 | Container image registry (development) |
| **Registry Prod** | 5002 | Container image registry (production) |
| **Promotion Service** | 8002 | Image promotion with role-based policy checks |
| **Bootstrap** | -- | One-shot init (Gitea admin, sample repos, seed data) |

---

## Quick Start

```bash
# Step 0: Check your machine is ready (run this first!)
./scripts/0-preflight.sh

# Step 1: Clone the repo
git clone https://github.com/stratione/mcp-lab.git
cd mcp-lab

# Step 2: Start the lab (creates .env, starts services, seeds data)
./scripts/1-setup.sh

# Step 3: Open all lab URLs in your browser
./scripts/2-open-lab.sh

# Optional: Open only API docs tabs
./scripts/3-open-api-docs.sh
```

The setup script will:
1. Create `.env` from `.env.example` and `.env.secrets` from `.env.secrets.example`
2. Run `docker compose up -d` — starts core services + `chat-ui` (MCP servers are off by default)
3. Wait for bootstrap to finish (creates Gitea admin, sample repos, pushes 5 sample images to dev registry)
4. Extract the Gitea API token and inject it into `.env` automatically

> **Important:** The setup script does **not** install or pull Ollama models. Make sure `ollama pull llama3.1:8b` is done before running setup (see [Ollama](#ollama-install-before-the-workshop)).

> **Default state after setup:** All MCP servers are OFF (0 tools). Enable them one at a time as you progress through the lab.

---

## MCP On/Off — Quick Toggle

This is the core mechanic of the workshop. Start and stop MCP servers to enable/disable tool categories.

### Enable MCP servers

```bash
# Enable User tools (+6 tools)
docker compose up -d mcp-user

# Enable Gitea tools (+7 tools → 13 total)
docker compose up -d mcp-gitea

# Enable Registry tools (+3 tools → 16 total)
docker compose up -d mcp-registry

# Enable Promotion tools (+3 tools → 19 total)
docker compose up -d mcp-promotion

# Enable ALL at once (all 19 tools)
docker compose up -d mcp-user mcp-gitea mcp-registry mcp-promotion
```

### Disable MCP servers

```bash
# Disable User tools
docker compose stop mcp-user

# Disable Gitea tools
docker compose stop mcp-gitea

# Disable Registry tools
docker compose stop mcp-registry

# Disable Promotion tools
docker compose stop mcp-promotion

# Disable ALL MCP servers (back to 0 tools)
docker compose stop mcp-user mcp-gitea mcp-registry mcp-promotion
```

### Check current state

```bash
docker compose ps              # see which containers are running
curl http://localhost:3001/api/tools   # see which tools are available
```

After starting or stopping an MCP server, **refresh the Chat UI** (http://localhost:3001) — the tool count in the header updates within 30 seconds automatically.

### Persist MCP state across restarts

Edit `.env` to control which servers start automatically on `docker compose up -d`:

```bash
COMPOSE_PROFILES=                              # no MCP servers (default)
COMPOSE_PROFILES=user                          # user tools only
COMPOSE_PROFILES=user,gitea,registry,promotion # all 19 tools
```

After editing `.env`:

```bash
docker compose down && docker compose up -d
```

---

## Environment Configuration

The environment is split into two files for screen-sharing safety:

| File | Contents | Safe to show on screen? |
|------|----------|------------------------|
| `.env` | LLM provider, Ollama URL, Gitea token, profiles | **Yes** |
| `.env.secrets` | API keys (Anthropic, OpenAI, Google) | **No — keep hidden** |

```bash
# .env — safe to share on screen during the workshop
COMPOSE_PROFILES=            # which optional MCP servers auto-start
GITEA_TOKEN=auto-injected    # filled in by setup script

LLM_PROVIDER=ollama          # Options: ollama, openai, anthropic, google
LLM_MODEL=llama3.1:8b
OLLAMA_URL=http://host.containers.internal:11434
```

```bash
# .env.secrets — keep this file private
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...
```

---

## LLM Providers

| Provider | Model | Cost | Notes |
|----------|-------|------|-------|
| **Ollama** | `llama3.1:8b` | Free / local | Default. Intentionally struggles with tool calling |
| **OpenAI** | `gpt-4o` | API key | Strong tool calling |
| **Anthropic** | `claude-sonnet-4-5-20250929` | API key | Strong tool calling |
| **Google** | `gemini-2.0-flash` | API key | Strong tool calling |

The workshop intentionally starts with Ollama so students experience a weaker model's tool-calling limitations before seeing MCP improve the experience.

To switch providers: open the Chat UI → settings panel → select provider → enter API key → Apply.

---

## Workshop Lab Guide

### Phase 1: Manual Operations (Without MCP)

> **Goal:** Feel the friction of raw REST interaction. All MCP servers are OFF.

In this phase you interact with each system directly via `curl`. Notice the friction: different authentication schemes, different API formats, manual credential management.

#### Exercise 1: User Management

```bash
# Create a user
curl -X POST http://localhost:8001/users \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","email":"alice@example.com","full_name":"Alice Smith","role":"developer"}'

# List all users
curl http://localhost:8001/users

# Get a specific user
curl http://localhost:8001/users/1

# Look up by username
curl http://localhost:8001/users/by-username/alice

# Update a user's role
curl -X PUT http://localhost:8001/users/1 \
  -H "Content-Type: application/json" \
  -d '{"role":"reviewer"}'
```

#### Exercise 2: Gitea Repository Management

You need admin credentials for every request:

```bash
# List repositories (requires auth)
curl -u mcpadmin:mcpadmin123 http://localhost:3000/api/v1/repos/search | jq '.data[].full_name'

# Create a new repo
curl -X POST -u mcpadmin:mcpadmin123 http://localhost:3000/api/v1/user/repos \
  -H "Content-Type: application/json" \
  -d '{"name":"my-service","description":"A new service","auto_init":true}'

# List branches
curl -u mcpadmin:mcpadmin123 http://localhost:3000/api/v1/repos/mcpadmin/sample-app/branches | jq '.[].name'

# Create a branch
curl -X POST -u mcpadmin:mcpadmin123 http://localhost:3000/api/v1/repos/mcpadmin/sample-app/branches \
  -H "Content-Type: application/json" \
  -d '{"new_branch_name":"feature-x","old_branch_name":"main"}'
```

#### Exercise 3: Container Registry

```bash
# List images in dev registry
curl http://localhost:5001/v2/_catalog

# List tags for an image
curl http://localhost:5001/v2/sample-app/tags/list

# Check prod registry (should be empty)
curl http://localhost:5002/v2/_catalog
```

#### Exercise 4: Image Promotion

Try to promote an image and observe the policy enforcement:

```bash
# This should FAIL — alice is a developer, not a reviewer
curl -X POST http://localhost:8002/promote \
  -H "Content-Type: application/json" \
  -d '{"image_name":"sample-app","tag":"v1.0.0","promoted_by":"alice"}'

# First, update alice to reviewer role
curl -X PUT http://localhost:8001/users/1 \
  -H "Content-Type: application/json" \
  -d '{"role":"reviewer"}'

# Now try again — this should succeed
curl -X POST http://localhost:8002/promote \
  -H "Content-Type: application/json" \
  -d '{"image_name":"sample-app","tag":"v1.0.0","promoted_by":"alice"}'

# Check the promotion audit log
curl http://localhost:8002/promotions

# Verify image is now in prod
curl http://localhost:5002/v2/sample-app/tags/list
```

#### Phase 1 Reflection

Notice the friction points:
- **Multiple API formats** — each system has its own REST conventions
- **Credential management** — Gitea requires auth, registries don't, user API doesn't
- **No workflow** — you manually orchestrated the cross-system flow
- **No policy abstraction** — you had to know the promotion rules
- **Multiple tools** — curl, jq, base64 encoding for Gitea files

---

### Phase 2: Introducing MCP

> **Goal:** Enable MCP servers incrementally and watch complexity disappear.

#### Step 1: Open the Chat UI

1. Open http://localhost:3001 in your browser
2. Select your LLM provider:
   - **Ollama**: Free and local. Make sure Ollama is running (`ollama pull llama3.1:8b`)
   - **OpenAI / Anthropic / Google**: Enter your API key
3. Click **Apply**

#### Step 2: Start User MCP Server (+6 tools)

```bash
docker compose up -d mcp-user
```

Wait ~10 seconds, then refresh the Chat UI. Try these prompts:

- "List all users"
- "Create a new user named bob with email bob@example.com and role developer"
- "What role does alice have?"
- "Update alice's role to admin"

Each tool call appears as a collapsible card in the chat. No curl required.

#### Step 3: Start Gitea MCP Server (+7 tools → 13 total)

```bash
docker compose up -d mcp-gitea
```

Wait ~10 seconds, then refresh the Chat UI — the tool count in the header grows to 13. Try:

- "List all Git repositories"
- "Create a new repo called my-service"
- "What branches does sample-app have?"
- "Create a feature branch in sample-app"

No credentials needed in your prompts — the MCP server handles auth injection.

#### Step 4: Start Registry MCP Server (+3 tools → 16 total)

```bash
docker compose up -d mcp-registry
```

Refresh the Chat UI after ~10 seconds. Try:

- "What images are in the dev registry?"
- "List tags for sample-app in dev"
- "Is sample-app available in the prod registry?"

#### Step 5: Start Promotion MCP Server (+3 tools → 19 total)

```bash
docker compose up -d mcp-promotion
```

Refresh the Chat UI after ~10 seconds. Try:

- "Show all promotion records"
- "What's the status of promotion #1?"

#### Phase 2 Reflection

Compare to Phase 1:
- **Unified interface** — one chat, one protocol
- **No credential management** — MCP injects auth automatically
- **Progressive disclosure** — tools appear as MCP servers are started
- **Consistent experience** — same interaction pattern regardless of backend system
- **Independence** — each MCP server can be started/stopped without affecting others

---

### Phase 3: Intent-Based DevOps (Full MCP)

> **Goal:** Express complex multi-system intents in natural language. All 19 tools ON.

Make sure all MCP servers are running:

```bash
docker compose up -d mcp-user mcp-gitea mcp-registry mcp-promotion
```

#### Exercise 1: Full Onboarding

> "Onboard a new developer named Charlie (charlie@example.com). Create their user account as a developer, then create a Git repository called charlie-service for them."

Watch the agent:
1. Call `create_user` to make the account
2. Call `create_gitea_repo` to create the repository
3. Report back with a summary

#### Exercise 2: Policy-Aware Promotion

> "Promote the sample-app:v1.0.0 image from dev to prod. Have charlie do the promotion."

Watch the agent hit a policy wall (charlie is a developer, not a reviewer), then try:

> "Update charlie's role to reviewer, then promote sample-app:v1.0.0 from dev to prod with charlie as the promoter."

The agent will:
1. Find charlie's user ID
2. Update charlie to reviewer
3. Retry the promotion — succeeds

#### Exercise 3: Audit and Investigation

- "Show me all promotion records. Which ones failed and why?"
- "What images are available in prod? How did they get there?"
- "List all users and their roles. Who has permission to promote images?"

#### Exercise 4: Complex Multi-System Workflow

> "I need to set up a release process: create a user named releasebot with reviewer role, create a repo called release-automation, create a feature branch called v2-prep in sample-app, and then show me the current state of both registries."

Watch the agent chain multiple tool calls across all four systems.

#### Phase 3 Reflection

What MCP provides as a control plane:
- **Translation** — natural language to specific API calls across systems
- **Policy enforcement** — promotion rules checked automatically
- **Credential injection** — no secrets in prompts
- **Audit trail** — all actions logged and queryable
- **Composability** — multi-system workflows from single intents
- **Progressive capability** — independent servers control the blast radius

---

## MCP Tools Reference

| Category | MCP Server | Port | Count | Tools |
|----------|-----------|------|-------|-------|
| **User Management** | `mcp-user` | 8003 | 6 | `user_list`, `user_get`, `user_search`, `user_create`, `user_update`, `user_deactivate` |
| **Git / Gitea** | `mcp-gitea` | 8004 | 7 | `gitea_list_repos`, `gitea_create_repo`, `gitea_list_branches`, `gitea_create_branch`, `gitea_get_file`, `gitea_create_file`, `gitea_update_file` |
| **Container Registry** | `mcp-registry` | 8005 | 3 | `registry_list_images`, `registry_list_tags`, `registry_get_manifest` |
| **Image Promotion** | `mcp-promotion` | 8006 | 3 | `promotion_promote`, `promotion_list`, `promotion_status` |

Each MCP server is an independent container. Start/stop them to enable/disable tool categories:

```bash
docker compose up -d mcp-user        # Start User tools
docker compose stop mcp-user         # Stop User tools
```

---

## API Endpoints Reference

### Service Health Checks

```bash
curl http://localhost:8001/health    # User API
curl http://localhost:8002/health    # Promotion Service
curl http://localhost:3000/api/v1/version  # Gitea
curl http://localhost:5001/v2/_catalog    # Registry Dev
curl http://localhost:5002/v2/_catalog    # Registry Prod
curl http://localhost:3001/api/tools      # Chat UI / MCP tools list
```

### Web Interfaces

| Interface | URL | Credentials |
|-----------|-----|-------------|
| Chat UI | http://localhost:3001 | — |
| Gitea | http://localhost:3000 | `mcpadmin` / `mcpadmin123` |
| User API Swagger | http://localhost:8001/docs | — |
| Promotion Service Swagger | http://localhost:8002/docs | — |
| Gitea Swagger | http://localhost:3000/api/swagger | — |

### User API (Port 8001)

```bash
GET    http://localhost:8001/users                   # List all users
GET    http://localhost:8001/users/{id}              # Get user by ID
POST   http://localhost:8001/users                   # Create user
PUT    http://localhost:8001/users/{id}              # Update user
DELETE http://localhost:8001/users/{id}              # Delete user
```

### Promotion Service (Port 8002)

```bash
GET  http://localhost:8002/promotions    # List all promotions
POST http://localhost:8002/promote       # Promote image from dev to prod
     Body: {"image_name":"string","image_tag":"string","approved_by":"string"}
```

### Gitea API (Port 3000)

Authentication: pass `Authorization: token <GITEA_TOKEN>` header (token is in `.env`).

```bash
GET http://localhost:3000/api/v1/repos/search          # Search repos
GET http://localhost:3000/api/v1/user/repos            # List user repos
GET http://localhost:3000/api/v1/repos/{owner}/{repo}/branches   # List branches
```

### Container Registry Dev (Port 5001)

```bash
GET http://localhost:5001/v2/_catalog                      # List all images
GET http://localhost:5001/v2/{image}/tags/list             # List tags
GET http://localhost:5001/v2/{image}/manifests/{tag}       # Get manifest
```

### Full Promotion Workflow Test

```bash
# 1. Check dev registry
curl http://localhost:5001/v2/sample-app/tags/list

# 2. Promote image
curl -X POST http://localhost:8002/promote \
  -H "Content-Type: application/json" \
  -d '{"image_name":"sample-app","image_tag":"v1.0.0","approved_by":"admin"}'

# 3. Verify in prod registry
curl http://localhost:5002/v2/sample-app/tags/list

# 4. Check promotion history
curl http://localhost:8002/promotions
```

---

## Scripts Reference

Scripts are numbered in run order. Optional scripts are prefixed with `OPT-`.

| Script | When to run | What it does |
|--------|-------------|--------------|
| `scripts/0-preflight.sh` | **Before everything** | Checks Docker/Podman, RAM, Ollama. Prints install instructions if anything is missing. |
| `scripts/1-setup.sh` | First time setup | Detects engine (prompts if both available), creates `.env`, starts all services, seeds data, injects Gitea token |
| `scripts/2-open-lab.sh` | Any time | Opens core lab endpoints in your browser (no API docs tabs) |
| `scripts/3-open-api-docs.sh` | Optional | Opens only API docs tabs (Gitea/User/Promotion Swagger) |
| `scripts/4-help.sh` | Any time | Print quick reference (services, URLs, commands) |
| `scripts/5-teardown.sh` | Cleanup | Reuses saved engine choice, removes containers, images, and volumes (full reset) |
| `scripts/6-tunnel.sh` | Remote access | Expose MCP server publicly via ngrok or cloudflared |

Internal scripts (called automatically — do not run directly):
- `scripts/_detect-engine.sh` — shared engine detection helper; prompts if both Docker and Podman are available, saves choice to `.engine`
- `scripts/bootstrap.sh` — one-shot init container entry point
- `scripts/init-gitea.sh` — creates Gitea admin user, token, sample repo
- `scripts/seed-registry.sh` — pushes `sample-app:v1.0.0` to dev registry

---

## Managing Services

```bash
# Check what's running
docker compose ps

# Restart all services
docker compose restart

# Start an MCP server (enables its tools in Chat UI)
docker compose up -d mcp-gitea

# Stop an MCP server (disables its tools in Chat UI)
docker compose stop mcp-gitea

# Start all MCP servers at once
docker compose up -d mcp-user mcp-gitea mcp-registry mcp-promotion

# View logs
docker compose logs -f chat-ui
docker compose logs -f mcp-user
docker compose logs -f mcp-gitea

# Full stop/start
docker compose down && docker compose up -d

# Nuclear reset (wipes all data volumes including chat history)
docker compose down -v
```

---

## Troubleshooting

### Preflight fails: No container runtime found

Install Docker Desktop or Podman:

```bash
# Docker Desktop — download from https://www.docker.com/products/docker-desktop

# Or Podman (macOS):
brew install podman docker-compose
podman machine init && podman machine start

# Or Podman (Ubuntu):
sudo apt-get install -y podman docker-compose
```

### Preflight fails: Container engine not running

```bash
# Docker — start Docker Desktop app
# Podman — start the machine:
podman machine start
```

### Service not responding

```bash
docker compose ps
docker compose logs <service-name>
docker compose restart <service-name>
```

### Registry connection issues

```bash
# Podman — use --tls-verify=false for local registries
podman push localhost:5001/image:tag --tls-verify=false
podman pull localhost:5001/image:tag --tls-verify=false

# Docker — local registries work without extra flags
docker push localhost:5001/image:tag
docker pull localhost:5001/image:tag
```

### Gitea token issues

```bash
# Find the token in bootstrap logs
docker compose logs bootstrap | grep GITEA_TOKEN

# Update .env with correct token, then restart mcp-gitea
docker compose restart mcp-gitea
```

### Ollama connection issues

```bash
# Check if Ollama is running
curl http://localhost:11434/api/version

# Start Ollama
ollama serve

# Set the right OLLAMA_URL in .env for your engine:
#   Docker Desktop (Mac/Windows): http://host.docker.internal:11434  (default)
#   Podman on macOS:              http://host.containers.internal:11434
#   Linux (native Docker):        http://172.17.0.1:11434
```

### Chat UI shows wrong tool count after starting MCP server

The Chat UI polls for new tools every 30 seconds. Hard-refresh the page (`Cmd+Shift+R` / `Ctrl+Shift+R`) if you don't want to wait.

### Docker Hub pull error: "unauthorized" or "invalid username/password"

This is usually a transient Docker Hub rate-limit error, especially with Podman:

```bash
# Pull the base image manually first, then re-run setup
podman pull docker.io/library/python:3.12-slim
./scripts/1-setup.sh
```

If it persists, log in to Docker Hub (free account): `podman login docker.io`

### Data and chat history

Chat history is stored server-side in a Docker volume (`chat-ui-data`), not in your browser. Running `docker compose down -v` removes all data including chat history, Gitea repos, registry images, and user data. This is intentional — the lab is designed to be fully disposable.

---

## Claude Code (stdio mode)

Each MCP server supports stdio transport for direct use with Claude Code:

```bash
cd mcp-server && pip install -r requirements.txt
```

See `config/mcp/claude-code-config.json` for the full configuration with all 4 servers (`mcp-user`, `mcp-gitea`, `mcp-registry`, `mcp-promotion`). Each has its own stdio launcher script (`run_user.sh`, `run_gitea.sh`, etc.).

---

## Workshop Proposal

**Title:** From Hallucination to Orchestration: Teaching the Model Context Protocol as a DevOps Control Plane

**Format:** Hands-on workshop (90 minutes) | **Track:** DevOps / Platform Engineering / AI-Assisted Operations

### Abstract

Large Language Models promise to revolutionize DevOps workflows, but in practice they hallucinate API calls, lose track of credentials, and cannot enforce organizational policy. This workshop gives attendees a visceral, hands-on experience of that gap — then closes it with MCP.

Participants start with a local LLM (Ollama, llama3.1:8b) connected to zero backend tools. When asked to "list all users," the model confidently invents data. When asked to "promote an image to production," it fabricates API responses. This is Phase 1: The Struggle.

Then, server by server, participants start independent MCP containers and watch the same LLM transform from a hallucination engine into a reliable multi-system orchestrator. By the end, a single natural-language sentence triggers a chain of verified tool calls across four backend systems, with credential injection, policy enforcement, and a full audit trail — all invisible to the user.

### Key Design Decisions

1. **Independent MCP servers** — each tool category is its own container. A single `docker compose up -d mcp-gitea` (or `podman compose`) is the simplest possible progressive disclosure. No config files, no restarts.
2. **Ollama as default** — free, local, no API keys. The llama3.1:8b model intentionally struggles with tool calling, making the MCP improvement dramatic.
3. **Split env files** — `.env` (screen-safe) and `.env.secrets` (API keys). Instructor can share screen without exposing credentials.
4. **Real policy enforcement** — the promotion service actually checks user roles via the User API. Students see real rejections.
5. **Dual transport** — streamable-http (containers) and stdio (Claude Code) demonstrate MCP's transport flexibility.

### Workshop Timing

| Phase | Duration | Description |
|-------|----------|-------------|
| Pre-work | Before lab | Install Docker or Podman, install Ollama + pull `llama3.1:8b` (~4.9 GB), run `0-preflight.sh` |
| Setup | 10 min | Clone, `./scripts/1-setup.sh`, verify Chat UI |
| Phase 1: The Struggle | 20 min | Hallucination, manual curl, friction |
| Phase 2: Progressive Enablement | 30 min | Start MCP servers, watch tool count grow |
| Phase 3: Intent-Based DevOps | 20 min | Multi-system orchestration, policy enforcement |
| Wrap-Up | 10 min | Discussion: MCP vs. API gateways, production considerations |

### What Makes This Workshop Different

- **Experiential learning, not slides** — no presentation deck; the "aha moment" comes from felt friction
- **Real systems, not mocks** — every service has a real database; nothing is stubbed
- **Model-agnostic** — same lab works with Ollama, OpenAI, Anthropic, and Google Gemini
- **Take-home value** — participants leave with a working MCP dev environment on their laptop

---

## License

MIT
