---
marp: true
theme: gaia
paginate: true
title: MCP DevOps Lab
description: Workshop deck for the MCP DevOps Lab
size: 16:9
style: |
  section {
    font-size: 26px;
    padding: 50px 60px;
  }
  section.lead {
    text-align: center;
    justify-content: center;
  }
  section.lead h1 {
    font-size: 64px;
    line-height: 1.15;
  }
  section.lead h3 {
    font-weight: 400;
    color: #555;
    margin-top: 0.4em;
  }
  h1 { font-size: 40px; }
  h2 { font-size: 34px; }
  table {
    font-size: 20px;
    width: 100%;
    border-collapse: collapse;
    margin-top: 0.4em;
  }
  th, td {
    padding: 6px 10px;
    border-bottom: 1px solid #ddd;
    vertical-align: top;
  }
  th {
    background: #f4f4f4;
    text-align: left;
  }
  pre, code {
    font-size: 20px;
  }
  pre {
    border-radius: 6px;
    padding: 14px 18px;
    line-height: 1.4;
  }
  blockquote {
    font-style: normal;
  }
  section::after {
    color: #888;
  }
---

<!-- _class: lead -->

# MCP DevOps Lab

### From "it just works" to opening the hood

Conference workshop · Hands-on

<!-- Speaker: keep this slide up while attendees settle. The whole talk hangs on one inversion: they've used MCP, today they will build it. -->

---

## Why we're here

You've enabled an MCP integration in Claude, Cursor, or similar.

It just worked. You moved on.

Today: **what's actually happening on the other end of that wire** — the backends, the protocol, and how to deploy your own.

<!-- Frame the room as people who have used MCP without thinking about it. We are not selling MCP. We are dissecting it. -->

---

<!-- _class: lead -->

# LLMs do not talk API.

# They talk MCP.

<!-- This is the visual anchor of the whole deck. Pause here. Everything that follows justifies this sentence. -->

---

## What you'll watch happen

1. A model **fabricates** a user list with zero tools.
2. We bring one MCP server online. The same model **grounds itself** against a real database.
3. We add four more servers, one at a time.
4. The same model executes a real **build → scan → promote → deploy** pipeline from a single English sentence.

Everything runs on `localhost`. No cloud accounts.

<!-- Set expectations. The arc is failure → grounding → orchestration. Audience watches it on screen and follows along on their laptops. -->

---

## Step 1 — Clone and preflight

```bash
git clone https://github.com/stratione/mcp-lab.git
cd mcp-lab/scripts
./1-preflight.sh
```

`1-preflight.sh` checks: container runtime (Docker or Podman), RAM, `curl`, `git`, Docker credential-helper sanity, and Ollama.

It does not modify anything. It tells you what's missing and how to fix it.

<!-- Get them running this immediately. Preflight is read-only — safe to run while you keep talking. -->

---

## Step 2 — Setup (pick a tier)

```bash
./2-setup.sh
```

You'll be prompted for a tier. **Pick `large`.**

Setup runs in the background while we talk. Don't ctrl-C it — there's a reason it takes a minute.

<!-- The interactive prompt asks 1/2/3 for small/medium/large. Tell the room to pick 3. The full lab is ~1.5 GB. -->

---

## The three tiers

| Tier | Disk | Containers | MCP tools | Teaches |
|---|---|---|---|---|
| `small` | ~700 MB | 4 | 9 | "What is MCP?" |
| `medium` | ~900 MB | 5 | 16 | "MCP acts on your behalf" |
| `large` | ~1.5 GB | 8+ | 27 | "MCP runs your CI/CD" |

Each tier is a strict **superset** of the previous one. You can `make medium` then `make large` later — no teardown.

<!-- If a laptop is on fumes, small is fine — they can level up mid-workshop. But the full demo arc needs large. -->

---

## Why bootstrap takes a minute

`2-setup.sh` waits for the bootstrap container to **exit cleanly** before declaring ready.

That container:

- Creates the Gitea admin + API token
- Seeds sample repos (a real Python `app.py` + `Dockerfile`)
- Pushes `sample-app:v1.0.0` to the dev registry
- Runs an integration check that the seed succeeded

We do TDD. Setup blocks on the tests. **Don't ctrl-C.**

<!-- This is the slide that prevents 30 attendees from killing the script at 0:45 and DM'ing you "is it broken?". The wait is intentional. -->

---

## What's actually running

12 services on one Docker network (`mcp-lab-net`):

| Service | Port | Role |
|---|---|---|
| Chat UI | 3001 | React SPA + FastAPI · aggregates all MCPs |
| User API | 8001 | User CRUD (FastAPI + SQLite) |
| Gitea | 3000 | Git server |
| Registry Dev / Prod | 5001 / 5002 | OCI v2 registries |
| Promotion Service | 8002 | Manifest + blob copy, audit log |
| `mcp-user` / `-gitea` / `-registry` / `-promotion` / `-runner` | 8003–8007 | The MCP servers |
| Bootstrap | — | One-shot seeder |

Architecture modal: click the chat-ui logo.

<!-- Don't read the table. Point at the chat-ui at 3001 — it's the front door. Everything else is behind it. -->

---

## Caveat: not every model can do this

The lab requires a model with **tool-calling support**. Some models / clients can't.

Confirmed working in the lab:

- **Ollama `llama3.1:8b`** — free, local, default. Intentionally weak at tool calling — that's the lesson.
- **Anthropic `claude-sonnet-4-5-20250929`** — strong tool calling
- **OpenAI `gpt-4o`** — strong tool calling
- **Google `gemini-2.0-flash`** — strong tool calling

Switch providers live from the chat-ui's provider chip. Same lab, four backends.

<!-- If someone asks "can I use [their favorite model]?" — the answer is "if it does function calling, yes." If not, today is a spectator sport. -->

---

## The cold open: Flying Blind

Fresh page load → http://localhost:3001 starts in **Hallucination Mode**.

The chat-ui:

1. Strips every real tool. The model sees one tool: `enable_mcp_tools`.
2. Replaces the system prompt with a permissive one — "answer from memory."

Ask Ollama: *"List all users in the system."*

It returns a plausible roster. **Invented usernames. Invented emails. Invented roles. Zero tool calls.**

<!-- Run this live. Don't preview it. Let the audience see the model lie confidently. This is the visceral hook. -->

---

## The grounding moment

```bash
docker compose up -d mcp-user
```

Hallucination Mode auto-clears the second the server comes online. Tool count jumps from `1` to `10`.

Same prompt. Same model. Now it calls `list_users`, hits the real API, and returns real rows.

The pivot from "lying" to "grounded" is **one `compose up` command**.

<!-- The auto-clear is intentional UX — no toggle hunting. The point is: bringing tools online is a deployment action, not a model change. -->

---

## The walkthrough — phase by phase

The chat-ui has a built-in **Walkthrough** (◇ button in the header). It's the canonical demo arc.

| Phase | What happens |
|---|---|
| **0. Cold open** | Watch the model guess with zero tools |
| **1. Identity & access** | `mcp-user` — read roles, list users, onboard a teammate |
| **2. Source control** | `mcp-gitea` — list repos, per-call auth ("as diana...") |
| **3. Build & scan** | `mcp-runner` — clone + compile + push to dev registry |
| **4. Registry & artifacts** | `mcp-registry` — inspect catalog, tag a release |
| **5. Promotion (audited)** | `mcp-promotion` — copy dev → prod, audit log |
| **6. Deploy & verify** | `deploy_app` — pull from prod, run a real container |
| **7. Iterate — ship v2** | Code change → rebuild → repromote → redeploy |
| **8. Wrap** | Recap |

<!-- Don't enumerate every step. The walkthrough has 42 — let the in-app card driver do that. Your job is the spine. -->

---

## Phase 1: Identity — the simplest MCP

`mcp-user` exposes 9 tools: `list_roles`, `list_users`, `get_user`, `create_user`, `update_user`, ...

**Teach moment — `create_user` requires a `role`.** If the model omits it, the API rejects with HTTP 422 and the model has to call `list_roles` first.

This is the value of strict APIs behind MCP: the model can't make up a valid role.

<!-- The 422 → list_roles dance is a great demo of how good API design forces the model to ground itself. -->

---

## Phase 2: Source — "MCP acts on your behalf"

```text
Prompt: "I am diana, password diana-lab-123.
Create me a repo called diana-experiment."
```

The Gitea MCP authenticates **as diana for that one call**.

Gitea's commit log records diana as the author — not the lab admin, not the model.

This is the real production point: **MCP is the credential injection layer.** Secrets never enter the prompt. Identity follows the user, not the bot.

<!-- This is the slide DevOps engineers care about. Multi-tenant tool calls with per-call identity is the production-grade story. -->

---

## Phases 3–5: Build, registry, promote

```text
Prompt: "Build the hello world app from sample-app."
```

`build_image` clones from Gitea, builds the image, and pushes to `registry-dev`.

In the chat-ui's **MCP servers panel** at the bottom: the live registry catalog.

The new tag **flashes green** the moment the push lands. This is the money shot.

Then: `tag_image` → `promote_image` (dev → prod, audit row written) → same green flash on the prod side.

<!-- Hang on this slide. The live registry view is the visual payoff — the audience sees the artifact materialize without anyone running docker push. -->

---

## Phase 6: Deploy & verify — real containers

```text
Prompt: "Deploy hello-app:v1.0.0 to dev."
```

`deploy_app` pulls from `registry-prod` and runs a container on port `9080`.

Verify from the host:

```bash
curl http://localhost:9080/
# {"message":"Hello from MCP Lab!","version":"1.0.0"}
```

A container that did not exist 90 seconds ago, served from a registry that did not contain it 90 seconds ago, built from a repo we cloned at the top of the demo.

<!-- This is the closing beat of the technical arc. The curl response is the proof. Pull it up live. -->

---

## Phase 7: Iterate — ship v2

Real SDLC, not a one-shot:

1. **Edit source** — `as alice, change app.py so version returns "2.0.0"`
2. **Rebuild** — `build_image` with `tag="v2.0.0"`
3. **Promote + redeploy** — `promote_image` then `deploy_app` in one prompt

Re-curl `localhost:9080`. The JSON now reads `"version": "2.0.0"`.

Same MCPs. Different commit. End-to-end pipeline driven by English.

<!-- The whole point of having dev/prod separation is shipping a second version. This phase proves the loop closes. -->

---

## What MCP gave us

| Without MCP | With MCP |
|---|---|
| Model fabricates | Model grounds against real systems |
| Secrets in prompts | Credentials injected by the server |
| 5 different auth schemes | One protocol |
| Manual orchestration | Multi-system intent in one sentence |
| No audit trail | Every promotion records who did it |
| ad-hoc curl | Verifiable tool calls + per-call Verify buttons |

MCP is **a control plane**, not a tool format.

<!-- Last technical slide. Frame MCP as the abstraction layer your DevOps tooling has been missing. -->

---

## Where to go next

- **Repo**: https://github.com/stratione/mcp-lab
- **Build your own MCP**: 5 servers in `mcp-server/` — copy `server_user.py` as a template
- **Dual transport**: same code runs over `streamable-http` (containers) and `stdio` (Claude Code) via `MCP_TRANSPORT`
- **Tear down clean**: `docker compose down -v` wipes everything, including chat history

The lab is open source. Clone it, fork it, ship your own.

<!-- The take-home. They leave with a runnable reference architecture. -->

---

<!-- _class: lead -->

# Questions

`./1-preflight.sh && ./2-setup.sh`

github.com/stratione/mcp-lab

<!-- Leave this up during Q&A so latecomers can still get started. -->
