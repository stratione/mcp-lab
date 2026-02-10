# Workshop Proposal: MCP as a DevOps Control Plane

**Title:** From Hallucination to Orchestration: Teaching the Model Context Protocol as a DevOps Control Plane

**Format:** Hands-on workshop (90 minutes)

**Track:** DevOps / Platform Engineering / AI-Assisted Operations

---

## Abstract

Large Language Models promise to revolutionize DevOps workflows, but in practice they hallucinate API calls, lose track of credentials, and cannot enforce organizational policy. This workshop gives attendees a visceral, hands-on experience of that gap — then closes it with the **Model Context Protocol (MCP)**.

Participants start with a local LLM (Ollama, llama3.1:8b) and a chat interface connected to zero backend tools. When asked to "list all users," the model confidently invents data. When asked to "promote an image to production," it fabricates API responses. This is Phase 1: The Struggle.

Then, flip by flip, participants enable MCP tool categories — user management, Git operations, container registry queries, image promotion with role-based policy checks — and watch the same LLM transform from a hallucination engine into a reliable multi-system orchestrator. By the end, a single natural-language sentence triggers a chain of verified tool calls across four backend systems, with credential injection, policy enforcement, and a full audit trail — all invisible to the user.

The lab runs entirely on each participant's laptop using Podman (or Docker) Compose with 8 pre-built services. No cloud accounts required. No API keys required (Ollama is free and local). Commercial LLM providers (OpenAI, Anthropic, Google) are supported for comparison but optional.

---

## Learning Objectives

By the end of this workshop, participants will be able to:

1. **Articulate the tool-calling gap** — explain why LLMs alone cannot reliably interact with external systems and why structured protocols are needed
2. **Describe MCP's role as a control plane** — understand how MCP provides translation, credential injection, policy enforcement, and progressive capability disclosure
3. **Implement feature-switched MCP tools** — build and register MCP tools with runtime enable/disable switches
4. **Design progressive disclosure patterns** — structure tool availability so that capabilities expand incrementally rather than all-at-once
5. **Evaluate LLM tool-calling quality** — compare how different models (local 8B vs. commercial) handle structured tool calling with and without MCP

---

## Target Audience

- Platform engineers building internal developer platforms
- DevOps engineers evaluating AI-assisted operations tooling
- Software architects designing LLM integration patterns
- Engineering managers assessing MCP for their organizations
- Anyone curious about practical LLM + DevOps integration

**Prerequisites:** Familiarity with REST APIs, containers, and basic terminal usage. No ML/AI experience required.

---

## Workshop Outline

### Setup (10 min)
- Clone repo, run `./scripts/setup.sh`
- 8 Docker Compose services start automatically
- Verify Chat UI at `localhost:3001`

### Phase 1: The Struggle (20 min)

**All MCP tool switches OFF. LLM provider: Ollama (llama3.1:8b).**

Participants interact with the chat interface and attempt DevOps tasks:
- "List all users in the system"
- "Create a Git repository called my-service"
- "What images are in the dev registry?"
- "Promote sample-app to production"

**Observed behavior:** The LLM hallucinates responses, invents user lists, fabricates API calls. No actual backend system is contacted. Participants document the failure modes.

**Discussion:** Why does this happen? What's missing between the LLM's intent and the backend systems?

### Phase 2: Progressive Enablement (30 min)

Participants enable MCP tool categories one at a time by editing `.env` and restarting:

| Step | Switch | Tools Added | Total | Sample Prompt |
|------|--------|-------------|-------|---------------|
| 2a | `USER_MCP_ENABLED=true` | 6 user tools | 6 | "List all users" |
| 2b | `GITEA_MCP_ENABLED=true` | 7 Git tools | 13 | "Create a repo called my-service" |
| 2c | `REGISTRY_MCP_ENABLED=true` | 3 registry tools | 16 | "What images are in dev?" |
| 2d | `PROMOTION_MCP_ENABLED=true` | 3 promotion tools | 19 | "Promote sample-app:v1.0.0 to prod" |

After each step, participants retry the same prompts from Phase 1 and observe:
- Tool calls appear as collapsible cards in the UI
- Real data flows from backend systems
- Authentication is handled invisibly (Gitea token injection)
- The tool count in the UI header grows with each restart

**Discussion:** How does adding tools change the LLM's behavior? What does progressive disclosure mean for blast radius?

### Phase 3: Intent-Based DevOps (20 min)

With all 19 tools enabled, participants attempt complex multi-system workflows:

1. **Onboarding workflow:** "Onboard a new developer named Charlie — create their user account, set up a Git repo called charlie-service, and create a feature branch."

2. **Policy-aware promotion:** "Promote sample-app:v1.0.0 from dev to prod. Have Charlie do the promotion." (Fails — Charlie is a developer, not a reviewer.) "Update Charlie to reviewer and try again." (Succeeds.)

3. **Audit investigation:** "Show all promotion records. Which ones failed and why? Who has permission to promote images?"

**Discussion:** What role did MCP play that the LLM couldn't fill alone? (Translation, credential injection, policy enforcement, audit trail, composability.)

### Wrap-Up and Discussion (10 min)
- MCP as a protocol vs. a product
- Comparison with traditional API gateways and service meshes
- When to use MCP vs. direct function calling
- Production considerations: observability, rate limiting, tool versioning

---

## Technical Architecture

### Infrastructure (runs on each participant's laptop)

```
Browser (:3001) --> Chat UI (FastAPI) --> MCP Server (FastMCP :8003)
                                              |
                    +-------------------------+-------------------------+
                    |              |                    |               |
              User API (:8001)  Gitea (:3000)  Registries (:5001/5002)  Promotion Svc (:8002)
              Python/FastAPI    Git hosting     OCI Registry v2         Policy engine
              SQLite            Repos/branches  Dev + Prod              Role-based checks
```

### Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| MCP Server | Python 3.12 + FastMCP | 19 tools, streamable-http transport |
| Chat UI | Python 3.12 + FastAPI + vanilla JS | Multi-provider LLM chat with tool display |
| User API | Python 3.12 + FastAPI + SQLite | User CRUD with role management |
| Gitea | Official Docker image | Git repo hosting with API |
| Registries | Registry v2 (official image) | Dev and prod container registries |
| Promotion Service | Python 3.12 + FastAPI + SQLite | Image promotion with policy checks |
| Orchestration | Docker/Podman Compose | 8 services, single bridge network |

### Key Design Decisions

1. **Feature switches over configuration files** — boolean environment variables (`USER_MCP_ENABLED=true`) are the simplest possible progressive disclosure mechanism. No YAML, no admin UI, just edit and restart.

2. **Ollama as default provider** — free, local, no API keys. The llama3.1:8b model intentionally struggles with tool calling, making the MCP improvement dramatic and visible.

3. **Split environment files** — `.env` (screen-safe, feature switches) and `.env.secrets` (API keys, never shown). Instructor can share screen without exposing credentials.

4. **Real policy enforcement** — the promotion service actually checks user roles via the User API. Students see rejections for unauthorized users, not simulated failures.

5. **Dual transport** — the MCP server supports both streamable-http (for Docker) and stdio (for Claude Code), demonstrating MCP's transport flexibility.

---

## What Makes This Workshop Different

### Experiential Learning, Not Slides

No presentation deck. Participants feel the friction of raw LLM interaction before seeing the solution. The "aha moment" comes from their own experience, not a diagram.

### Real Systems, Not Mocks

Every backend service is a real, running application with a real database. Gitea hosts actual Git repos. The registries store actual OCI images. Policy checks query actual user records. Nothing is stubbed.

### Model-Agnostic

The same lab works with Ollama (free), OpenAI, Anthropic, and Google Gemini. Participants can compare tool-calling quality across providers using the same MCP tools and backend systems.

### Progressive Complexity

The lab ramps naturally: zero tools (hallucination) to six tools (single system) to nineteen tools (multi-system orchestration with policy). Each step is a single line change in a config file.

### Take-Home Value

Participants leave with a working MCP development environment on their laptop, a reference implementation of feature-switched tools, and the muscle memory of building from friction to orchestration.

---

## Requirements

### Participant Requirements
- Laptop with 8 GB RAM minimum
- Podman Desktop or Docker Desktop installed
- Terminal access (bash/zsh)
- A web browser
- (Optional) Ollama installed with `llama3.1:8b` pulled
- (Optional) API key for OpenAI, Anthropic, or Google Gemini

### Instructor Requirements
- Projector/screen for live demonstration
- The same setup as participants (for live coding)
- Pre-pulled container images to avoid network dependency

### Network Requirements
- Internet access for initial `podman compose pull` (can be pre-cached)
- No ongoing internet required after setup (Ollama runs locally)

---

## About the Instructor

<!-- Replace with your bio -->

[Your Name] is a [title] at [organization] with experience in [relevant areas]. They have [relevant experience with MCP, DevOps, AI tooling, etc.].

---

## Resources

- **Repository:** [github.com/stratione/mcp-lab](https://github.com/stratione/mcp-lab)
- **MCP Specification:** [modelcontextprotocol.io](https://modelcontextprotocol.io)
- **FastMCP Library:** [github.com/modelcontextprotocol/python-sdk](https://github.com/modelcontextprotocol/python-sdk)
