# MCP DevOps Workshop Lab

> **DevOpsDays Austin 2026** — hands-on workshop. Run it on your own laptop and follow along live.

A hands-on workshop that teaches how the **Model Context Protocol (MCP)** transforms DevOps tooling by acting as a unified control, translation, and policy plane. Learners experience the friction of raw API interaction, then progressively enable MCP tools to see how structured tool calling eliminates complexity.

---

## Before the workshop — read this first

**You need Docker OR Podman installed and running.** Either one works; the lab auto-detects whichever you have. That is the one hard prerequisite — without a container runtime the lab will not start. Install instructions are in [Required Software](#required-software) below.

**Pull the lab at home, not at the venue.** Conference WiFi is shared with hundreds of people and will be slow. Do the steps below the night before — at home or at your hotel — so the workshop starts at "play" instead of "wait for download." The full lab is **~1.5 GB** on the `large` tier; that's the only download you have to do.

```bash
git clone https://github.com/stratione/mcp-lab.git
cd mcp-lab
./scripts/1-preflight.sh           # verifies your machine — read-only, safe to run anytime
./scripts/2-setup.sh --tier=large  # pulls + builds all images (~1.5 GB)
```

If `1-preflight.sh` flags anything missing, fix it before you arrive. You'll need an **LLM** to drive the chat — the lab supports four (OpenAI, Anthropic, Google, Ollama). Pick whichever you have an API key for; the chat-ui's provider chip switches between them live. Only Ollama needs a local download (~4.9 GB for `llama3.1:8b`), and it's optional. The pre-workshop checklist covers the LLM options in full: [docs/PRE-WORKSHOP.md](docs/PRE-WORKSHOP.md).

---

## What the lab does

The Chat UI loads in **Hallucination Mode** — the model has no tools and confidently fabricates. You bring MCP servers online one `compose up` at a time and watch the same model transform from "lying" to "grounded" to "orchestrating a real build → scan → promote → deploy pipeline from one English sentence." Everything runs on `localhost`. No cloud accounts.

The workshop is canonical inside the app: open `http://localhost:3001` and click the **◇ Walkthrough** button in the header. That tour drives every learning beat — phase by phase, prompt by prompt — and includes the per-tool Verify buttons, the live registry catalog, and the Compare tab (same prompt, two providers, side by side).

---

## System Requirements

Run `./scripts/1-preflight.sh` to validate your machine. It checks every item below and prints install instructions for anything missing.

### Minimum Hardware

`1-preflight.sh` enforces the **bold** items. The rest are recommendations — the lab will run with less, just slower.

| Requirement | Minimum | Recommended | Enforced? |
|-------------|---------|-------------|-----------|
| RAM | **8 GB** | 16 GB | ✅ checked by preflight |
| CPU | 4 cores | 8+ cores (Apple Silicon or modern x86) | not checked |
| Disk (large tier, no Ollama) | 2 GB free | 4 GB free | not checked |
| Disk (large tier + Ollama llama3.1:8b) | 8 GB free | 12 GB free | not checked |
| OS | macOS 12+, Linux, Windows (WSL2) | macOS 14+ / Ubuntu 22+ | OS family detected |
| Container runtime | **Docker OR Podman** | (either works) | ✅ checked by preflight |

### Disk Breakdown

Pick a tier at setup time; level up later without teardown. Each tier is a strict superset of the previous one.

| Component | Size |
|-----------|------|
| `small` tier  (4 containers, 9 tools)  | ~700 MB |
| `medium` tier (5 containers, 16 tools) | ~900 MB |
| `large` tier  (8+ containers, 27 tools — full workshop arc) | ~1.5 GB |
| Container runtime overhead (volumes, caches) | ~150 MB |
| Ollama `llama3.1:8b` model | ~4.9 GB |
| Ollama `gemma4:e4b` (optional bonus) | ~9.6 GB |
| **`large` tier without Ollama** | **~1.7 GB** |
| **`large` tier + llama3.1:8b** | **~6.5 GB** |

### Required Software

You need **one** container runtime — either Docker Desktop (https://www.docker.com/products/docker-desktop) or Podman (`brew install podman docker-compose && podman machine init && podman machine start` on macOS; `apt-get install -y podman docker-compose` on Debian/Ubuntu). The setup and teardown scripts auto-detect which engine you have.

**Ollama (free local LLM)** is optional but is the default model in the workshop. Install with `brew install ollama` (macOS) or `curl -fsSL https://ollama.ai/install.sh | sh` (Linux), then `ollama pull llama3.1:8b`. If you'd rather use a cloud LLM, drop an API key into `.env.secrets` for OpenAI, Anthropic, or Google instead — the chat-ui's provider chip switches between them live.

Full pre-workshop checklist (with the optional `gemma4:e4b` bonus model and provider key setup): [docs/PRE-WORKSHOP.md](docs/PRE-WORKSHOP.md).

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

**12 services** on a single container network (`mcp-lab-net`):

| Service | Port | Role |
|---------|------|------|
| Chat UI | 3001 | Web chat interface (React SPA + FastAPI) — aggregates tools from all MCP servers |
| mcp-user | 8003 | 9 user management MCP tools |
| mcp-gitea | 8004 | 7 Git/Gitea MCP tools with per-call auth |
| mcp-registry | 8005 | 5 container registry MCP tools |
| mcp-promotion | 8006 | 3 image promotion MCP tools |
| mcp-runner | 8007 | 3 CI/CD runner MCP tools (build, scan, deploy) |
| User API | 8001 | User CRUD (FastAPI + SQLite) |
| Gitea | 3000 | Git repository hosting |
| Registry Dev | 5001 | Container image registry (development) |
| Registry Prod | 5002 | Container image registry (production) |
| Promotion Service | 8002 | Image promotion (manifest + blob copy dev → prod, audit log) |
| Bootstrap | — | One-shot init (Gitea admin, sample repos, seed data) |

All MCP servers start **off** by default — enabling them is the workshop. The chat-ui shows live status, tool counts, and start/stop commands per server.

---

## Quick Start

```bash
git clone https://github.com/stratione/mcp-lab.git
cd mcp-lab
./scripts/1-preflight.sh                    # verify the machine
make small        # or: make medium / make large
# open http://localhost:3001 → click ◇ Walkthrough
```

Cleanup: `make down` to stop, `./scripts/3-teardown.sh` for a full reset.

---

## Where to learn the workshop

- **In-app walkthrough** — the canonical tour. Open `http://localhost:3001` and click **◇ Walkthrough** in the header.
- **[docs/PRE-WORKSHOP.md](docs/PRE-WORKSHOP.md)** — pre-workshop checklist and Ollama setup detail.
- **[docs/workshop-slides.md](docs/workshop-slides.md)** — speaker deck (also rendered to `workshop-slides.html` and `.pdf`).
- **[docs/architecture.excalidraw.json](docs/architecture.excalidraw.json)** — system diagram source.
- **[TODO.md](TODO.md)** — roadmap and known issues.

Each script under `scripts/` is self-documenting — read the header comments or run with `--help`. Service-level READMEs and Swagger live alongside each component (`user-api/`, `mcp-server/`, `chat-ui/`, `promotion-service/`).

---

## License

MIT
