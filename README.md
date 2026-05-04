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
- [Sample Prompts to Try](#sample-prompts-to-try)
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
- [Hallucination Mode (the cold-open moment)](#hallucination-mode-the-cold-open-moment)
- [Conference Proposal](#conference-proposal)

---

## System Requirements

**Run this before the workshop to verify your machine is ready:**

```bash
./scripts/1-preflight.sh
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
brew install podman docker-compose
brew install --cask podman-desktop      # GUI (cask, not a formula)
podman machine init
podman machine start

# Ubuntu/Debian
sudo apt-get install -y podman docker-compose

# Fedora/RHEL
sudo dnf install -y podman docker-compose
```

> **Note:** All `docker compose` commands in this guide work identically with `podman compose`. The setup and teardown scripts auto-detect your engine.

### Ollama (Install Before the Workshop)

The workshop starts with [Ollama](https://ollama.ai) — a free local LLM that runs without API keys. **Install and pull the model before arriving** so you're not waiting on a 4.9 GB download during the lab.

📖 **Full pre-workshop guide:** [docs/PRE-WORKSHOP.md](docs/PRE-WORKSHOP.md) — includes the optional **Gemma 4** bonus model for the model-comparison segment.

Quick version:

```bash
# macOS
brew install ollama
ollama serve &
ollama pull llama3.1:8b    # ~4.9 GB — required
ollama pull gemma4:e4b     # ~9.6 GB — optional bonus

# Linux
curl -fsSL https://ollama.ai/install.sh | sh
ollama pull llama3.1:8b
ollama pull gemma4:e4b     # optional
```

> **Note:** Ollama must be running on your host machine before starting the lab (`ollama serve`). The `1-preflight.sh` script will check for this.

To switch models inside the chat-ui, click the provider chip in the header and type the model name (e.g. `gemma4:e4b`) into the Model field — the lab uses whatever you've pulled.

**Alternative: Cloud LLM only (no Ollama).** If you don't want to install Ollama, add an API key to `.env.secrets` for OpenAI, Anthropic, or Google instead (see [LLM Providers](#llm-providers)). This skips the model download but requires a paid API key.

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
              +----------+--------+--------+-----------+-----------+
              |          |                 |           |           |
       +------v-----+ +--v-------+ +------v-----+ +--v---------+ +--v--------+
       | mcp-user   | | mcp-gitea| |mcp-registry| |mcp-promotion| | mcp-runner|
       |   :8003    | |   :8004  | |   :8005    | |   :8006    | |   :8007   |
       +------+-----+ +--+-------+ +------+-----+ +--+---------+ +--+--------+
              |           |                |           |              |
        +-----v--+  +-----v-+  +-------v--+  +--------v-----+  +----v-------+
        |User API|  |Gitea  |  |Registries|  |Promotion Svc |  |Docker Sock |
        | :8001  |  |:3000  |  |:5001/5002|  |   :8002      |  | (build/run)|
        +--------+  +-------+  +----------+  +--------------+  +------------+
```

### Chat UI Features

The web-based Chat UI (http://localhost:3001) is a React SPA backed by FastAPI. It includes:

- **Workshop wizard** — click the **◇ Walkthrough** button in the header to open the 35-step SDLC tour. It lives permanently as a tab next to **Try** in the right inspector so you can flip between context tabs without losing your place
- **Hallucination Mode toggle** — header switch that strips the LLM of every MCP tool and forces a permissive system prompt, producing the "fabricated user list" cold-open moment on demand
- **Compare tab (side-by-side)** — same prompt fired in parallel at two providers (e.g. Ollama vs Anthropic) so the audience watches a frontier model orchestrate the pipeline while a local model fumbles
- **Architecture diagram modal** — click the header logo for an embedded, dark-mode-friendly diagram of the lab topology
- **In-GUI Ollama model manager** — pull, list, and delete local Ollama models without leaving the browser
- **Per-tool Verify buttons** — every tool-call card renders a green Verify button that opens or fetches the source-of-truth URL (Gitea repo, deployed app, registry catalog) so the audience confirms the tool result against the actual system
- **MCP status panel** — click the MCP strip bar to see which servers are online/offline; expand any row's `›` chevron for inline copy-paste start/stop commands. Auto-refreshes every 3s while any server is offline, 30s when all are up
- **Tools tab** — accurate per-MCP-server tool listing with auto-refresh and a manual refresh button
- **Lab Dashboard** — grid view of all services with live status badges (UP/DOWN), a "Verify User API" section with runnable curl commands, and start/stop guidance for MCP servers
- **Per-call Gitea auth** — when a prompt identifies the actor (e.g. _"as diana, password secret"_), the Gitea MCP tools authenticate per call so the commit is attributed to that user — "MCP acts on your behalf"
- **Stop button** — the Send button turns into a red Stop button while a request is in-flight to cancel hung requests
- **Tool call cards** — every MCP tool call shows as a collapsible card with arguments, results, and Verify
- **Hallucination heuristics** — automatic verified/uncertain/unverified badge on every response, with an on-demand "Verify with LLM" button for deeper fact-checking against tool results
- **Token tracking** — per-turn and session-wide token counter
- **Copy button** — hover over any assistant message to copy the prompt + response for debugging
- **Secret-safe** — `/api/providers` returns `{has_key, key_preview}` only (last-4 preview); the full key never leaves the server, so screen sharing is safe
- **Color-blind accessible** — status indicators use text labels with arrows (▲ UP / ▼ DOWN) in addition to color
- **Server-side chat history** — chat is persisted in a Docker volume (not browser localStorage), so `docker compose down -v` wipes all data cleanly
- **Quick reference** — click the `?` help button for URLs, credentials, and commands; type `thestruggleisreal` anywhere on the page to unlock the cheat sheet
- **Cypress E2E tests** — `chat-ui/cypress/` covers the workshop wizard, compare flow, hallucination mode, launcher, and per-tool Verify

**12 services** on a single container network (`mcp-lab-net`):

| Service | Port | Role |
|---------|------|------|
| **Chat UI** | 3001 | Web chat interface (React SPA + FastAPI) — aggregates tools from all MCP servers |
| **mcp-user** | 8003 | 9 user management MCP tools (start on demand) |
| **mcp-gitea** | 8004 | 7 Git/Gitea MCP tools with per-call auth (start on demand) |
| **mcp-registry** | 8005 | 5 container registry MCP tools (start on demand) |
| **mcp-promotion** | 8006 | 3 image promotion MCP tools (start on demand) |
| **mcp-runner** | 8007 | 3 CI/CD runner MCP tools: build, scan, deploy (start on demand) |
| **User API** | 8001 | User CRUD (FastAPI + SQLite) |
| **Gitea** | 3000 | Git repository hosting |
| **Registry Dev** | 5001 | Container image registry (development) |
| **Registry Prod** | 5002 | Container image registry (production) |
| **Promotion Service** | 8002 | Image promotion with role-based policy checks |
| **Bootstrap** | -- | One-shot init (Gitea admin, sample repos, seed data) |

> **Tool count:** 9 + 7 + 5 + 3 + 3 = **27 active MCP tools**, plus a `list_mcp_servers` meta-tool exposed by the chat-ui itself. A 28th tool, `delete_all_users`, is intentionally hidden behind `USER_DESTRUCTIVE_TOOLS_ENABLED=true` — it stays in the source as a code-review talking point about footgun tools.

---

## Quick Start

### Pick your tier first

The lab ships in three sizes so you can match it to the machine you've got. Each tier is a strict superset of the previous one — you can start at `small` and `make medium` / `make large` later without tearing anything down. Same git clone, same `docker-compose.yml`; the tier just controls **which services get pulled and started**, so disk and RAM scale with what you actually opt into.

| Tier | Disk | Wire (first run) | RAM | Containers | MCP tools | Teaches |
|---|---|---|---|---|---|---|
| `small` (~700 MB) | 700 MB | ~600 MB | ~500 MB | 4 | 7 | "What is MCP?" — user-api + 1 MCP server + chat-ui |
| `medium` (~900 MB) | 900 MB | ~800 MB | ~700 MB | 5 | 14 | + Gitea — "MCP acts on your behalf" (per-call auth) |
| `large` (~1.5 GB) | 1.5 GB | ~1.0 GB | ~1.5 GB | 8+ | 20 | + registries + promotion + runner — "MCP runs your CI/CD" |

```bash
# Step 1: Clone (~10 MB regardless of tier)
git clone https://github.com/stratione/mcp-lab.git
cd mcp-lab

# Step 2: Check your machine is ready
./scripts/1-preflight.sh

# Step 3: Start the lab — pick the tier that matches your machine
make small         # smallest footprint, MCP basics only
# make medium      # adds Gitea + per-user auth demos
# make large       # full lab (equivalent to ./scripts/2-setup.sh)

# Step 4: Open the chat UI
# http://localhost:3001
# (click the ◇ Walkthrough button in the header for the guided tour)

# Level up later (no teardown needed):
# make medium
# make large

# When you're done:
# make down                  # stop containers, keep volumes
# ./scripts/3-teardown.sh    # full teardown (volumes + images)
```

**Bad workshop wifi?** Pre-pull images the night before over good wifi:
```bash
make prewarm-small    # or prewarm-medium / prewarm-large
```
Pre-warm only pulls and builds — it doesn't start anything. Workshop morning, `make small` (etc.) is then near-instant.

### Or run the legacy single-command setup

The full lab in one shot — equivalent to `make large`, plus it auto-injects the Gitea token into `.env`:

```bash
./scripts/2-setup.sh
```

API docs (open manually if you want them):
- Chat UI Swagger:        http://localhost:3000/api/swagger
- User API Swagger:       http://localhost:8001/docs
- Promotion API Swagger:  http://localhost:8002/docs

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
# Enable User tools (+9 tools)
docker compose up -d mcp-user

# Enable Gitea tools (+7 tools → 16 total)
docker compose up -d mcp-gitea

# Enable Registry tools (+5 tools → 21 total)
docker compose up -d mcp-registry

# Enable Promotion tools (+3 tools → 24 total)
docker compose up -d mcp-promotion

# Enable CI/CD Runner tools (+3 tools → 27 total)
docker compose up -d mcp-runner

# Enable servers one at a time — work through each phase before starting the next
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

# Disable CI/CD Runner tools
docker compose stop mcp-runner

# Disable ALL MCP servers (back to 0 tools)
docker compose stop mcp-user mcp-gitea mcp-registry mcp-promotion mcp-runner
```

### Check current state

```bash
docker compose ps              # see which containers are running
curl http://localhost:3001/api/tools   # see which tools are available
```

After starting or stopping an MCP server, the Chat UI auto-detects the change within a few seconds (it polls every 3 seconds while any server is offline). You can also click the refresh button in the MCP status panel.

### Persist MCP state across restarts

Edit `.env` to control which servers start automatically on `docker compose up -d`:

```bash
COMPOSE_PROFILES=                                             # no MCP servers (default)
COMPOSE_PROFILES=user                                         # user tools only
COMPOSE_PROFILES=user,gitea,registry,promotion,runner         # all 27 tools
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

## Sample Prompts to Try

Use these prompts in the Chat UI at each phase of the workshop. Start with all MCP servers OFF, then enable them one at a time and repeat the same prompts to see how the experience changes.

### With zero MCP servers (The Struggle)

Try these first — before starting any MCP servers:

- "List all users in the system"
- "Create a user named john with email john@example.com"
- "What Git repositories exist?"
- "List all container images in the dev registry"
- "Promote the sample-app image to production"
- "Build the hello-app from the sample-app repo and deploy it"

### After starting mcp-user

- "List all users"
- "What roles are available?"
- "Create a user named alice with email alice@example.com, full name 'Alice Anderson', and role dev"
- "What role does alice have?"
- "Change alice's role to reviewer"
- "Deactivate the user named bob"
- "Reactivate bob"

### After starting mcp-gitea

- "List all Git repositories"
- "Create a new repo called my-service"
- "What branches does sample-app have?"
- "Create a feature branch called v2-prep in sample-app"
- "As diana with password secret, create a repo called diana-experiments" — per-call auth attributes the action to that user, not to the lab admin

### After starting mcp-registry

- "What images are in the dev registry?"
- "List tags for sample-app in dev"
- "Is anything in the prod registry yet?"

### After starting mcp-promotion

- "Promote sample-app:v1.0.0 from dev to prod — have alice do it"
- "Why did the promotion fail?"
- "Show me all promotion records"

### After starting mcp-runner (full pipeline)

- "Build the hello-app from the sample-app repo, scan it, promote it to prod, and deploy it"
- "What's running on port 9082?"

### Multi-system workflows

- "Onboard a new developer named charlie with email charlie@example.com — create their user account and a Git repo called charlie-service"
- "Set up a release process: create a user named releasebot with reviewer role, then promote sample-app:v1.0.0 to production"
- "List all users and their roles. Who has permission to promote images?"
- "What images are in prod? How did they get there?"

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
  -d '{"username":"alice","email":"alice@example.com","full_name":"Alice Smith","role":"dev"}'

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

#### Step 2: Start User MCP Server (+9 tools)

```bash
docker compose up -d mcp-user
```

Wait ~10 seconds — the Chat UI auto-detects the new server within a few seconds. Try these prompts:

- "List all users"
- "What roles are available?" (calls `list_roles` — the LLM must know the valid roles)
- "Create a new user named bob with email bob@example.com, full name 'Bob Builder', and role dev"
- "What role does alice have?"
- "Update alice's role to admin"

> **Note:** The `create_user` tool requires a valid role (`admin`, `dev`, or `viewer`). If the LLM doesn't specify one, the API will reject the request with a 422 error and the LLM will need to call `list_roles` first.

Each tool call appears as a collapsible card in the chat. No curl required.

#### Step 3: Start Gitea MCP Server (+7 tools → 16 total)

```bash
docker compose up -d mcp-gitea
```

Wait ~10 seconds, then refresh the Chat UI — the tool count in the header grows to 15. Try:

- "List all Git repositories"
- "Create a new repo called my-service"
- "What branches does sample-app have?"
- "Create a feature branch in sample-app"

No credentials needed in your prompts — the MCP server handles auth injection.

#### Step 4: Start Registry MCP Server (+5 tools → 21 total)

```bash
docker compose up -d mcp-registry
```

Refresh the Chat UI after ~10 seconds. Try:

- "What images are in the dev registry?"
- "List tags for sample-app in dev"
- "Is sample-app available in the prod registry?"

#### Step 5: Start Promotion MCP Server (+3 tools → 24 total)

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

> **Goal:** Express complex multi-system intents in natural language. All 27 tools ON.

Enable MCP servers one at a time as you progress through each phase:

```bash
docker compose up -d mcp-user        # start here
docker compose up -d mcp-gitea       # after exploring user tools
docker compose up -d mcp-registry    # after exploring git tools
docker compose up -d mcp-promotion   # after exploring registry tools
docker compose up -d mcp-runner      # after exploring promotion tools
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

#### Exercise 3: Build, Promote, and Deploy Pipeline

> "Build the hello-app from the sample-app repo, scan it, promote it to prod, and deploy it."

Watch the agent chain the full CI/CD pipeline:
1. `build_image` — clones the Gitea repo, builds the Docker image, pushes to dev registry
2. `scan_image` — runs a security scan on the image
3. `promote_image` — copies the image from dev to prod registry (requires reviewer role)
4. `deploy_app` — pulls from prod registry and runs a live container

Verify the deployment yourself:

```bash
curl http://localhost:9082/        # {"message":"Hello from MCP Lab!","version":"1.0.0"}
curl http://localhost:9082/health  # {"status":"ok"}
```

Deploy port mapping: dev → `localhost:9080`, staging → `localhost:9081`, prod → `localhost:9082`.

#### Exercise 4: Audit and Investigation

- "Show me all promotion records. Which ones failed and why?"
- "What images are available in prod? How did they get there?"
- "List all users and their roles. Who has permission to promote images?"

#### Exercise 5: Complex Multi-System Workflow

> "I need to set up a release process: create a user named releasebot with reviewer role, create a repo called release-automation, create a feature branch called v2-prep in sample-app, and then show me the current state of both registries."

Watch the agent chain multiple tool calls across all five systems.

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
| **User Management** | `mcp-user` | 8003 | 9 | `list_roles`, `list_users`, `get_user`, `get_user_by_username`, `create_user`, `update_user`, `deactivate_user`, `activate_user`, `delete_user` |
| **Git / Gitea** | `mcp-gitea` | 8004 | 7 | `list_gitea_repos`, `get_gitea_repo`, `create_gitea_repo`, `list_gitea_branches`, `create_gitea_branch`, `get_gitea_file`, `create_gitea_file` (each accepts optional `username`/`password` for per-call auth) |
| **Container Registry** | `mcp-registry` | 8005 | 5 | `list_registries`, `list_registry_images`, `list_image_tags`, `get_image_manifest`, `tag_image` |
| **Image Promotion** | `mcp-promotion` | 8006 | 3 | `promote_image`, `list_promotions`, `get_promotion_status` |
| **CI/CD Runner** | `mcp-runner` | 8007 | 3 | `build_image`, `scan_image`, `deploy_app` |
| **Hidden footgun** | `mcp-user` | 8003 | (1) | `delete_all_users` — only registered when `USER_DESTRUCTIVE_TOOLS_ENABLED=true`. Stays in source as a code-review talking point. |
| **Chat-UI meta-tool** | `chat-ui` | 3001 | (1) | `list_mcp_servers` — handled in the chat-ui backend, not by any MCP server; lets the LLM introspect which servers are reachable |

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
curl http://localhost:3001/api/mcp-status # Chat UI / per-server reachability
```

### Chat UI API (Port 3001)

```bash
GET    http://localhost:3001/api/providers          # {has_key, key_preview} per provider — never returns full key
POST   http://localhost:3001/api/provider           # Set active provider/model
GET    http://localhost:3001/api/models?provider=…  # List installed models for a provider
GET    http://localhost:3001/api/tools              # Aggregated tool list across reachable MCP servers
GET    http://localhost:3001/api/mcp-status         # Per-server status + copy-paste start commands
POST   http://localhost:3001/api/mcp-control        # Start/stop an MCP server (compose up/stop)
GET    http://localhost:3001/api/hallucination-mode # Read current toggle state
POST   http://localhost:3001/api/hallucination-mode # Flip the toggle (strips tools + permissive prompt)
GET    http://localhost:3001/api/ollama/installed   # List local Ollama models
POST   http://localhost:3001/api/ollama/pull        # Pull an Ollama model from the UI
DELETE http://localhost:3001/api/ollama/models/{name} # Delete a local Ollama model
POST   http://localhost:3001/api/probe              # Server-side fetch of a verify URL (handles Docker→host rewrites)
GET    http://localhost:3001/api/chat-history       # Server-side chat persistence (volume-backed)
POST   http://localhost:3001/api/chat-history
DELETE http://localhost:3001/api/chat-history
POST   http://localhost:3001/api/chat               # Single-provider chat
POST   http://localhost:3001/api/chat-compare       # Side-by-side parallel chat across two providers
POST   http://localhost:3001/api/verify             # Deeper LLM-based verification of a previous response
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
GET    http://localhost:8001/users/roles             # List valid roles (admin, dev, viewer)
GET    http://localhost:8001/users                   # List all users
GET    http://localhost:8001/users/{id}              # Get user by ID
GET    http://localhost:8001/users/by-username/{name} # Look up user by username
POST   http://localhost:8001/users                   # Create user (role is required)
PUT    http://localhost:8001/users/{id}              # Update user
DELETE http://localhost:8001/users/{id}              # Delete user
```

### Promotion Service (Port 8002)

```bash
GET  http://localhost:8002/promotions    # List all promotions
POST http://localhost:8002/promote       # Promote image from dev to prod
     Body: {"image_name":"string","tag":"string","promoted_by":"string"}
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
  -d '{"image_name":"sample-app","tag":"v1.0.0","promoted_by":"eve"}'

# 3. Verify in prod registry
curl http://localhost:5002/v2/sample-app/tags/list

# 4. Check promotion history
curl http://localhost:8002/promotions
```

---

## Scripts Reference

Everyone — presenter and participants — runs the same three numbered scripts in order. The two un-numbered scripts are optional dev tools.

### Follow-along (everyone runs these)

| Script | When to run | What it does |
|--------|-------------|--------------|
| `scripts/1-preflight.sh`  | Before everything | Checks Docker/Podman, RAM, Ollama. Prints install instructions if anything is missing. |
| `scripts/2-setup.sh`      | First time setup  | Detects engine (prompts if both available), creates `.env`, starts all services, seeds data, injects Gitea token. |
| `scripts/3-teardown.sh`   | Cleanup           | Reuses saved engine choice, removes containers, images, and volumes (full reset). |

After step 2, open **http://localhost:3001** in your browser and click the **◇ Walkthrough** button in the header to start the guided tour. The walkthrough renders inline in the right-side inspector tab next to Try, and stays out of the way of the chat input.

### Dev / optional (un-numbered)

| Script | When to run | What it does |
|--------|-------------|--------------|
| `scripts/restart.sh`      | After editing code | Rebuilds + restarts in place. Default: refresh whatever is running. `--core` for chat-ui/user-api/promotion only. `--all` for everything including stopped. |
| `scripts/tunnel.sh`       | Remote access    | Expose an MCP server publicly via ngrok or cloudflared (see `scripts/TUNNEL.md`). |

Internal scripts (called automatically — do not run directly):
- `scripts/_internal/_detect-engine.sh` — shared engine detection helper; prompts if both Docker and Podman are available, saves choice to `.engine`
- `scripts/_internal/bootstrap.sh` — one-shot init container entry point
- `scripts/_internal/init-gitea.sh` — creates Gitea admin user, token, sample repo (seeds `app.py` + `Dockerfile` for a real HTTP hello-app)
- `scripts/_internal/seed-registry.sh` — pushes `sample-app:v1.0.0` to dev registry
- `scripts/_proto/` — throwaway prototype scripts kept for reference (FastMCP Context, Podman socket); not part of the workshop path

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

# Start servers one at a time as you progress through the lab phases

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

The Chat UI uses adaptive polling: every 3 seconds while any server is offline, every 30 seconds when all are up. Status should update within a few seconds. Click the refresh button (↻) in the MCP status panel for an immediate check, or hard-refresh the page (`Cmd+Shift+R` / `Ctrl+Shift+R`).

### Docker Hub pull error: "unauthorized" or "invalid username/password"

This usually means stale Docker Hub credentials are stored on your machine. Clear them, then retry:

```bash
# Clear stale credentials (run both — only the relevant one will do anything)
docker logout docker.io
podman logout docker.io

# Verify the pull works manually
podman pull docker.io/library/python:3.12-slim   # or: docker pull python:3.12-slim

# Then re-run setup
./scripts/2-setup.sh
```

If the pull still fails after clearing credentials, you may be hitting Docker Hub's anonymous rate limit. Create a free Docker Hub account and log in:

```bash
podman login docker.io   # or: docker login
```

### Data and chat history

Chat history is stored server-side in a Docker volume (`chat-ui-data`), not in your browser. Running `docker compose down -v` removes all data including chat history, Gitea repos, registry images, and user data. This is intentional — the lab is designed to be fully disposable.

---

## Claude Code (stdio mode)

Each MCP server supports stdio transport for direct use with Claude Code:

```bash
cd mcp-server && pip install -r requirements.txt
```

See `config/mcp/claude-code-config.json` for the full configuration with all 5 servers (`mcp-user`, `mcp-gitea`, `mcp-registry`, `mcp-promotion`, `mcp-runner`). Each has its own stdio launcher script in `mcp-server/`: `run_user.sh`, `run_gitea.sh`, `run_registry.sh`, `run_promotion.sh`, `run_runner.sh`. Transport is selected by the `MCP_TRANSPORT` env var (`stdio` for Claude Code, `streamable-http` for the docker stack).

---

## Hallucination Mode (the cold-open moment)

The Chat UI ships with a **Hallucination Mode** toggle in the header. When ON it:

1. Strips every MCP tool from the LLM's tool list (including the `list_mcp_servers` meta-tool).
2. Replaces the system prompt with a permissive one that encourages the model to answer from "memory."

The result: ask Ollama "list all users" and it will fabricate a plausible roster — invented usernames, invented emails, invented roles — with zero tool calls. Flip the toggle OFF and the same prompt grounds itself in the real SQLite database.

This is the recommended cold-open for the talk: hallucination ON for one minute, then OFF, then enable MCP servers one at a time to watch the same model become reliable.

State does **not** persist across `chat-ui` restarts — leaving it on by accident between sessions could confuse a future audience, so a deliberate flip every demo is the safer default.

---

---

## Conference Proposal

### Proposal Title

From Hallucination to Orchestration: The Model Context Protocol as a DevOps Control Plane

### Session Type

Presentation (20 minutes)

### Abstract

LLMs confidently hallucinate API calls, leak credentials, and ignore policy — yet we keep asking them to run our infrastructure. This talk demonstrates what actually fixes that. Using a live, fully containerized DevOps environment (12 services, zero cloud accounts), I show an LLM hallucinating its way through user management, git operations, and container deployments — then flip on MCP servers one by one and watch the same model transform into a reliable multi-system orchestrator. The finale: a single English sentence triggers a verified build-scan-promote-deploy pipeline across five backend systems, producing a live running container — with credential injection, role-based policy enforcement, and a full audit trail, all invisible to the user. No slides. No mocks. Everything runs on localhost.

### Description

Every DevOps team experimenting with LLM-assisted operations hits the same wall: the model sounds confident but fabricates API responses, forgets credentials between calls, and has no concept of organizational policy. The Model Context Protocol (MCP) is Anthropic's open standard for giving LLMs structured access to external tools — but most introductions stop at "here's how to write a tool definition." This talk shows what MCP actually changes in practice, using a live demo environment purpose-built to make the difference visceral.

**The environment:** A Docker Compose stack running 12 services on a single network — a User API (FastAPI + SQLite), a Gitea git server, dev and prod container registries, a promotion service with role-based access control, and a CI/CD runner with Docker-in-Docker build and deploy capabilities. Five independent MCP servers expose 27 tools across these systems. A web-based Chat UI connects to all of them via streamable-http JSON-RPC. Everything runs on localhost; the audience can clone the repo and follow along.

**The demo arc:**

*Phase 1 — The Struggle (3 min):* I flip on **Hallucination Mode** and ask a local LLM (Ollama llama3.1:8b) to "list all users" with zero MCP servers running. It invents a plausible roster — fake usernames, fake emails, fake roles — with zero tool calls. I ask it to "promote sample-app to production." It fabricates a success response. I then show the same tasks done correctly via raw curl against five different APIs — different auth schemes, different payload formats, manual credential threading. The audience feels the friction.

*Phase 2 — Progressive Enablement (7 min):* I flip Hallucination Mode off and start MCP servers one at a time. `docker compose up -d mcp-user` — the Chat UI's tool count jumps from 0 to 9. I repeat "list all users" and the LLM now calls the real API, returns real data, and handles validation errors gracefully. I add mcp-gitea (+7 tools), mcp-registry (+5 tools), mcp-promotion (+3 tools), mcp-runner (+3 tools). Each addition is a single command with no config changes. The audience watches capabilities accumulate.

*Phase 3 — The Payoff (7 min):* With all 27 tools active, I type: "Build the hello-app from the sample-app repo, scan it for vulnerabilities, promote it to production, and deploy it." The LLM chains four tool calls: `build_image` clones from Gitea and pushes to the dev registry; `scan_image` runs a security check; `promote_image` copies the image to prod (and gets rejected because the user is a developer, not a reviewer — real policy enforcement); after a role update, the promotion succeeds; `deploy_app` pulls from prod and runs the container. I curl `localhost:9082` and get `{"message":"Hello from MCP Lab!","version":"1.0.0"}` from a container that didn't exist 30 seconds ago. Optional encore: open the **Compare tab** to run the same prompt at Ollama and Anthropic in parallel — same panes, same prompt, the frontier model finishes the chain in ~28s while the local model fumbles in ~43s.

*Wrap-up (3 min):* Key takeaways — MCP as a control plane (not just a tool protocol), progressive disclosure as a deployment strategy, why real policy enforcement matters more than mock demos, and how the same architecture works across Ollama, OpenAI, Anthropic, and Google Gemini.

**What the audience takes home:** The entire lab is open source. Clone, run one script, and you have the same environment on your laptop — a reference architecture for building MCP-powered DevOps tooling with real services, real policy, and real deployments.

### Key Design Decisions

1. **Independent MCP servers** — each tool category is its own container. A single `docker compose up -d mcp-gitea` is the simplest possible progressive disclosure. No config files, no restarts.
2. **Real deployments, not mocks** — `deploy_app` runs actual containers (`docker pull` + `docker run`) serving HTTP on localhost. The audience sees a real curl response from a container that was built, scanned, promoted, and deployed live.
3. **Ollama as default** — free, local, no API keys. The llama3.1:8b model intentionally struggles with tool calling, making the MCP improvement dramatic.
4. **Split env files** — `.env` (screen-safe) and `.env.secrets` (API keys). Presenter can share screen without exposing credentials.
5. **Real policy enforcement** — the promotion service checks user roles via the User API. The audience sees a real rejection and a real fix.
6. **Dual transport** — streamable-http (containers) and stdio (Claude Code) demonstrate MCP's transport flexibility.

### Workshop Format (90 minutes, if accepted as hands-on lab)

The same content scales to a 90-minute hands-on workshop where every attendee runs the lab themselves:

| Phase | Duration | Description |
|-------|----------|-------------|
| Pre-work | Before lab | Install Docker or Podman, install Ollama + pull `llama3.1:8b` (~4.9 GB), run `1-preflight.sh` |
| Setup | 10 min | Clone, `./scripts/2-setup.sh`, verify Chat UI at localhost:3001 |
| Phase 1: The Struggle | 20 min | Hallucination demo, manual curl against 5 APIs, friction |
| Phase 2: Progressive Enablement | 25 min | Start MCP servers one by one, watch tool count grow from 0 → 27 |
| Phase 3: Full Pipeline | 25 min | Build/scan/promote/deploy via natural language, policy enforcement, multi-system orchestration |
| Wrap-Up | 10 min | Discussion: MCP vs. API gateways, production considerations, what to build next |

### What Makes This Talk Different

- **Live demo, not slides** — the "aha moment" comes from watching real failure transform into real orchestration
- **Real systems, real containers** — every service has a real database; the deploy step produces a running container you can curl
- **Model-agnostic** — same lab works with Ollama, OpenAI, Anthropic, and Google Gemini
- **Zero cloud dependency** — everything runs on localhost via Docker or Podman; no accounts or API keys required
- **Take-home value** — the audience leaves with an open-source repo they can clone and run in 5 minutes

---

## License

MIT

---

<sub>Feeling stuck? Type `thestruggleisreal` anywhere on the Chat UI page (click outside the input box first) to unlock the cheat sheet with API documentation and tool schemas.</sub>
