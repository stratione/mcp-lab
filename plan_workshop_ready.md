# Workshop-Ready: Fix the MCP DevOps Lab End-to-End for a 20-Minute Live Demo

This is a living execution plan following the rules in `/Users/noelorona/Desktop/repos/mcp-lab/CLAUDE.md`. Every section marked (Living) is updated as work proceeds. The plan is self-contained: a novice with shell access, this repo, and an Anthropic API key can follow it without external references.


## Purpose / Big Picture

Make the MCP DevOps Lab presentable as a 20-minute live demo at a conference where the presenter:

1. Runs **one command** at the top of the talk (`./scripts/7-workshop.sh`) which brings the whole lab up, opens the Chat UI in the browser, opens the Lab Dashboard in a second tab, and tails MCP-server logs in a Terminal window the audience can read.
2. Demonstrates a **Hallucination moment** (cold-open: tools off + permissive prompt = a confidently-fabricated user list).
3. Demonstrates a **Tool-grounding moment** (same prompt + MCP servers = real seeded users from the live SQLite DB).
4. Demonstrates a **Provider comparison moment** (same prompt running side-by-side: Ollama llama3.1:8b vs the presenter's Anthropic / OpenAI / Google key).
5. Demonstrates a **Pipeline finale**: one English sentence — "Build the hello-app from the sample-app repo, scan it, promote it to prod, and deploy it" — chains `build_image` → `scan_image` → `promote_image` → `deploy_app`, ends in `curl http://localhost:9082/` returning `{"message":"Hello from MCP Lab!","version":"1.0.0"}` from a container that did not exist 30 seconds earlier.

Why this matters: the lab works for everything *except* the finale today (the runner crashes on a stale FastMCP API, and the API key leaks via `GET /api/providers`). Both are screen-share disasters. Fixing them makes the demo presentable; the new launcher script and side-by-side mode make it *good*.

How to observe success: at the end of this plan, an outsider can run `git clone … && ./scripts/0-preflight.sh && ./scripts/1-setup.sh && ./scripts/7-workshop.sh` on a clean macOS laptop with Podman Desktop installed, and inside ~3 minutes have the four demo moments ready to perform with no terminal switching, no curl pasting, and no key leaks.


## Progress (Living)

- [x] (2026-05-01 14:50Z) Milestone 0 — Test infrastructure: pytest + Cypress + Makefile. `make test` → 2 pytest + 3 Cypress passed.
- [x] (2026-05-01 15:10Z) Milestone 1 — README + scripts truth pass; `delete_all_users` gated behind `USER_DESTRUCTIVE_TOOLS_ENABLED`. Live mcp-user dropped from 9 → 8 tools. 4 mcp-server unit tests + 2 chat-ui integration tests + all M0 tests still green.
- [ ] Milestone 2 — Secret-leak fix on `/api/providers` and audit other endpoints
- [ ] Milestone 3 — Hallucination Mode toggle (UI + permissive system prompt + meta-tool hide)
- [ ] Milestone 4A — *Prototype:* validate FastMCP `Context` API and Podman socket mount in a throwaway script
- [ ] Milestone 4B — Apply prototype findings to `runner_tools.py`, `deploy_tools.py`, and `docker-compose.yml`
- [ ] Milestone 5 — BYOK side-by-side provider compare (UI + parallel-request backend route)
- [ ] Milestone 6 — `scripts/7-workshop.sh` launcher + `scripts/8-reset.sh` between-session reset


## Surprises & Discoveries (Living)

_None yet. Will be updated as implementation proceeds. Format: date, finding, evidence (one-line command output or file:line)._


## Decision Log (Living)

Every design decision lives here as: **Decision** → **Rationale** → **Date** → **Alternatives rejected and why**.

- **D-001** Recommend Anthropic Sonnet 4.5 (or any frontier model) for Phase 3 finale; keep Ollama for Phase 1 hallucination & Phase 2 list/show. → Llama 3.1 8B has been observed to fumble multi-step orchestration even with the runner fixed; the presentation moment depends on a clean chain. → 2026-05-01 → Rejected: tuning prompts for Llama. Rejected because it is slide-time the presenter does not have, and any improvement is fragile.

- **D-002** `delete_all_users` is hidden by default behind `USER_DESTRUCTIVE_TOOLS_ENABLED=false` (default false), not deleted. → Lets the codebase show the danger pattern in code review while keeping it off the live LLM tool list. → 2026-05-01 → Rejected: deleting it. Rejected because reviewers might want to discuss the anti-pattern.

- **D-003** Side-by-side compare (Milestone 5) runs both providers in parallel via `asyncio.gather`. → The visual moment is "both panes thinking, then frontier wins"; serial would be anticlimactic. → 2026-05-01 → Rejected: serial. Rejected for being boring.

- **D-004** Meta-tool `list_mcp_servers` is **not** counted in the public tool number. Public count is the sum across MCP servers (currently 9 + 7 + 5 + 3 + 3 = 27, plus 1 meta-tool documented separately). → Matches what each MCP server actually contributes to a stdio user. → 2026-05-01 → Rejected: counting it. Rejected because the meta-tool is a chat-ui implementation detail, not a property of any MCP server.

- **D-005** Hallucination Mode is a server-side switch via `POST /api/hallucination-mode` plus a UI toggle in the header. It does **not** persist across `chat-ui` restarts. → A presenter who accidentally leaves it on between sessions could confuse a future audience; a deliberate flip every demo is the safer default. → 2026-05-01 → Rejected: localStorage persistence. Rejected for above safety reason.

- **D-006** When Hallucination Mode is ON, the system prompt is replaced (not appended). The `list_mcp_servers` meta-tool and *all* MCP-server tools are removed from the tool list passed to the LLM, so it has no choice but to invent a reply. → If we left tools available, the LLM would call them and the dramatic moment would be lost. → 2026-05-01 → Rejected: keeping the meta-tool visible. Rejected because Sonnet has been observed to call `list_mcp_servers` first and ground its reply, killing the moment.

- **D-007** `/api/providers` returns `{"has_key": bool, "key_preview": "sk-…XYZ"}` (last 4 chars only) and never returns `api_key`. → Even one leaked key is a screen-share-recording disaster; a 4-char preview is enough for the presenter to confirm "yes, that's my key" without exposing the secret. → 2026-05-01 → Rejected: returning the full key. Rejected — the whole reason this milestone exists.

- **D-008** `scripts/7-workshop.sh` is macOS-first (uses `open -a "Terminal"` and `open` to launch tabs). Linux best-effort branch detects `xdg-open` and `gnome-terminal`/`konsole`/`xterm` but is not part of acceptance. Windows/WSL2 not in scope. → The presenter is on macOS; defer cross-platform until after the conference. → 2026-05-01 → Rejected: building cross-platform from day one. Rejected — not on the critical path.

- **D-009** TDD is mandatory for every milestone except Milestone 4A (the throwaway prototype). Every code-changing step writes the failing test first, runs it to confirm RED, implements the minimal code to pass, confirms GREEN, then refactors while staying green. → The lab will be regression-tested live during the workshop; a silent break on stage is unrecoverable. → 2026-05-01 → Rejected: tests-after. Rejected per the `superpowers:test-driven-development` skill — tests written after implementation answer "what does this do" instead of "what should this do" and miss edge cases by design.

- **D-010** Cypress (not Playwright) is the E2E test runner for chat-ui browser flows. → The repo has zero existing browser-test infrastructure; Cypress installs as a single npm dev-dep, runs headless in CI and headed for live debugging, and does not require a separate test container. → 2026-05-01 → Rejected: Playwright. Same capabilities; rejected to keep one framework per surface and to match the user's stated preference.

- **D-011** Backend Python tests use `pytest` + `httpx.AsyncClient` against the FastAPI app via `httpx.ASGITransport` — no separate test server, no docker spin-up for unit tests. The chat-ui's MCP-fetch path is exercised against a `respx`-mocked MCP server. Real-container integration tests are marked `@pytest.mark.integration` and excluded from the default fast suite. → Sub-second TDD red→green cycle without paying container cold-start cost. → 2026-05-01 → Rejected: spinning real containers per test. Rejected for being slow and flaky.

- **D-012** Existing uncommitted changes in `chat-ui/app/main.py` (logging instrumentation) and `chat-ui/app/mcp_client.py` (httpx session-id propagation fix for `tools/list` after `initialize`) are preserved as-is and become the M0 starting tree. → They are real bug fixes the user already made; reverting would cost feature parity. The first regression test added in M0 will pin the session-id behavior so the fix doesn't get lost in a future refactor. → 2026-05-01 → Rejected: discarding the WIP. Rejected because the diff is small, clearly an improvement, and verified by my own walkthrough.

- **(Q1, Q2, Q3, Q4 in the Outcomes section start as open questions; Decision Log entries D-013 onward will be written when the prototype resolves them.)**


## Outcomes & Retrospective (Living)

_Will be completed at each milestone exit and at plan completion. Open questions:_

- **Q1** (resolved by Milestone 4A) — Is `Context.info()` (FastMCP `Context` parameter injection) the right replacement for `mcp.server.request_context.session.send_log_message()` in `mcp>=1.20.0`? If not, is silently dropping the log calls acceptable?
- **Q2** (resolved by Milestone 4A) — Does mounting `$XDG_RUNTIME_DIR/podman/podman.sock:/var/run/docker.sock` in `mcp-runner` and aliasing `docker` → `podman` let the runner `git clone`, `docker build`, and `docker push registry-dev:5000/...` from inside the container on rootless Podman? If not, fall back to rootful Podman (documented).
- **Q3** (resolved by Milestone 4A) — Will `docker push localhost:5001/...` from inside `mcp-runner` (which sees `registry-dev:5000` on the compose network) silently break? `mcp-server/mcp_server/config.py` line 15 already sets `DEV_REGISTRY_HOST = "registry-dev:5000"` correctly, so no change should be needed — confirm with the prototype.
- **Q4** (carried) — Should the side-by-side compare default to a curated demo prompt or be free-form? Plan says free-form with a "Try the finale" button that pre-fills the canonical sentence.


## Context and Orientation

### Repository layout (verified 2026-05-01)

```
/Users/noelorona/Desktop/repos/mcp-lab/
├── CLAUDE.md                     ← skeleton this plan follows
├── README.md                     ← 985 lines; has factual drift (Milestone 1)
├── docker-compose.yml            ← 12 services on mcp-lab-net
├── chat-ui/
│   ├── app/
│   │   ├── main.py               ← FastAPI; secret leak at /api/providers (Milestone 2);
│   │   │                           system prompt at lines 304–314 (Milestone 3)
│   │   ├── llm_providers.py      ← OllamaProvider, OpenAIProvider, AnthropicProvider,
│   │   │                           GoogleProvider, PretendProvider; all share the same
│   │   │                           `chat(messages, tools)` signature (Milestone 5)
│   │   ├── mcp_client.py         ← list_tools, call_tool, _LOCAL_TOOLS includes
│   │   │                           list_mcp_servers (Milestone 3 hides this on toggle)
│   │   ├── models.py             ← Pydantic; needs new ProviderInfo / Compare models
│   │   └── static/
│   │       ├── index.html        ← header buttons; needs Hallucination Mode toggle
│   │       │                       and Compare-Mode tab (Milestones 3, 5)
│   │       ├── app.js            ← 1094 lines; provider Apply, MCP modal, dashboard
│   │       └── style.css
│   └── Dockerfile
├── mcp-server/
│   ├── Dockerfile                ← installs docker-ce-cli; needs podman alias (Milestone 4)
│   ├── requirements.txt          ← mcp[cli]>=1.20.0, httpx>=0.27.0
│   ├── mcp_server/
│   │   ├── config.py             ← DEV_REGISTRY_HOST = "registry-dev:5000" (Milestone 4)
│   │   ├── server_runner.py      ← FastMCP("mcp-runner", ..., port=8007)
│   │   └── tools/
│   │       ├── runner_tools.py   ← BROKEN: lines 29, 52, 73 use stale FastMCP API
│   │       ├── deploy_tools.py   ← uses `docker` CLI; same Podman socket issue
│   │       └── user_tools.py     ← line 122 has delete_all_users (Milestone 1, hide it)
│   └── run_user.sh, run_gitea.sh, run_registry.sh, run_promotion.sh
│      (note: there is no run_runner.sh — Claude Code stdio config covers 4 servers, plan must add 5th)
├── promotion-service/
│   └── app/
│       ├── main.py               ← POST /promote
│       ├── models.py             ← PromoteRequest{image_name, tag, promoted_by}
│       │                           — README contradicts itself; Milestone 1 fixes README
│       └── promote.py            ← admin-role policy check (line 49)
├── user-api/                     ← FastAPI + SQLite
│   └── app/models.py             ← UserCreate requires {username, email, full_name, role}
│                                   — README sample prompt at line 349 omits full_name
├── hello-app/                    ← what the runner pipeline builds, not what gets cloned
│   └── app.py                    ← serves {"message":"Hello from MCP Lab!","version":"1.0.0"}
└── scripts/
    ├── 0-preflight.sh            ← OK
    ├── 1-setup.sh                ← OK
    ├── 2-start-lab.sh, 3-refresh-lab.sh, 5-teardown.sh   ← OK
    ├── 6-tunnel.sh               ← OK
    ├── 7-workshop.sh             ← NEW (Milestone 6)
    ├── 8-reset.sh                ← NEW (Milestone 6) — between-session reset
    ├── _detect-engine.sh         ← persists choice in .engine
    ├── bootstrap.sh, init-gitea.sh, seed-registry.sh
    └── _proto/                   ← NEW (Milestone 4A) — throwaway prototype scripts
```

### Jargon (define once, reference everywhere)

- **MCP** — Model Context Protocol. Anthropic's open standard for giving an LLM structured access to tools. Tools are described by JSON schema; the LLM picks one to call; the MCP server runs the call and returns JSON. Transport is JSON-RPC over either stdio or HTTP.
- **streamable-http** — the HTTP transport variant for MCP. Each lab MCP server listens on a port (8003–8007) at `/mcp` and accepts JSON-RPC POSTs with `Accept: application/json, text/event-stream`. The chat-ui (`chat-ui/app/mcp_client.py`) is the client.
- **FastMCP** — the server-side helper class in `mcp.server.fastmcp`. You instantiate it once per server, decorate functions with `@mcp.tool()`, and call `mcp.run(transport=...)`. Modern versions (≥1.20) inject a `Context` object into tool functions when you declare a `ctx: Context` parameter — that's the new way to send progress updates back to the client.
- **Tool grounding** — the LLM uses an MCP tool result as a fact source for its reply, instead of inventing the answer.
- **Hallucination** — the LLM invents a confident-sounding answer with no factual basis.
- **Compose service name** — the DNS name a container can use to reach a peer on the same compose network. Inside the lab, `registry-dev` resolves to the dev registry on its internal port 5000 (which is published on the host as 5001). This matters in Milestone 4: the runner inside a container must push to `registry-dev:5000`, not `localhost:5001`.
- **Podman socket** — Podman's API socket. On rootless Podman (the default on macOS), it lives at `$XDG_RUNTIME_DIR/podman/podman.sock`. On rootful Podman, `/var/run/podman/podman.sock`. The Docker CLI can talk to it if `DOCKER_HOST=unix://path/to/sock` is set or the socket is bind-mounted at `/var/run/docker.sock`.
- **Phase 3 finale prompt** — the literal sentence the presenter types: `Build the hello-app from the sample-app repo, scan it, promote it to prod, and deploy it`. Source of truth: `README.md` line 374 / 607.

### What's confirmed working today (do not break)

- `./scripts/0-preflight.sh` and `./scripts/1-setup.sh` succeed (~62s to a healthy 6-container core).
- 6 seeded users (`alice`, `bob`, `charlie`, `diana`, `eve`, `system`) with mixed roles in the `user-api` SQLite DB.
- 4 seeded repos in `registry-dev`: `sample-app` (tags `v1.0.0`, `v1.1.0`), `web-frontend`, `auth-service`, `data-pipeline` (per `scripts/seed-registry.sh`).
- All 5 MCP servers start independently, chat-ui detects within ~3s.
- `eve` (admin) successfully promoted `sample-app:v1.1.0` from dev to prod end-to-end via Anthropic Sonnet — confirms `mcp-promotion` is healthy and the policy check works.
- Multi-provider switch UI exists for Ollama / OpenAI / Anthropic / Google / Pretend.

### What's broken (the four fixes — a/b/c/d, mapped to milestones below)

- **(a) Pipeline runner** — `mcp-server/mcp_server/tools/runner_tools.py` lines 29, 52, 73 call `mcp.server.request_context.session.send_log_message(...)`. The installed `mcp>=1.20.0` no longer exposes `mcp.server`. Every `build_image` / `scan_image` / `deploy_app` invocation throws `'FastMCP' object has no attribute 'server'` immediately. *Note:* `scan_image` (line 52) and `deploy_app` (line 73) reference numbers in the brief but inspection shows scan_image is at lines 107–158 and uses no `send_log_message`; the only callers are `build_image` at lines 29, 52, 73. Plus, even after that's fixed, `subprocess.exec("docker", ...)` against the bind-mounted `/var/run/docker.sock` fails on rootless Podman with `permission denied`. → Milestone 4.

- **(b) Secret leak** — `chat-ui/app/main.py` lines 62–73 (`GET /api/providers`) returns the full `_provider_config` dict including `api_key`. `POST /api/provider` at lines 76–86 echoes the same. → Milestone 2.

- **(c) Hallucination disabled by safety prompt** — `chat-ui/app/main.py` lines 304–314 hardcodes "If a server is reported as OFFLINE, you CANNOT use its tools" and "Do NOT guess or hallucinate". This kills the cold-open. The plan adds a server-side switch + UI toggle that swaps the system prompt and removes all tools from the request when ON. → Milestone 3.

- **(d) README + scripts drift** — see Milestone 1 for the line-by-line list. → Milestone 1.


## Plan of Work

The plan is a sequence of seven milestones ordered by **risk × signal**: test infrastructure first (so every later milestone can practice TDD), cosmetic fixes second (quick wins, easy to roll back), behavior-changing fixes next (each gated by tests + manual validation), the prototype-then-implement runner fix, then net-new UI features last so they sit on a stable base.

After each milestone the lab must remain runnable end-to-end at its current capability. No milestone is allowed to leave `main` in a broken state. Use `git switch -c plan-mX-name` per milestone, validate (`make test` must be green), then merge.

### Testing discipline (applies to every milestone except M4A)

This plan follows test-driven development per the `superpowers:test-driven-development` skill (see D-009). Every code-changing step has its failing test written **first**, run to confirm RED, then implementation, then confirmation of GREEN, then refactor. The Iron Law: no production code without a failing test in front of it. The single exception is **Milestone 4A** (a throwaway prototype) — that script *is* itself the test.

Two test surfaces:

1. **Backend (Python) — pytest + httpx.AsyncClient.** Lives in `chat-ui/tests/` and `mcp-server/tests/`. Runs against the FastAPI app via `httpx.ASGITransport`, no real network. MCP server interactions are stubbed with `respx` so chat-ui tests don't need real containers. Real-container integration tests are marked `@pytest.mark.integration` and excluded from the default fast suite.

2. **Browser (Cypress) — installed via npm as a chat-ui dev dependency.** Lives in `chat-ui/cypress/e2e/`. Runs against a real running `chat-ui` (`http://localhost:3001`). Cypress covers the user-visible workshop moments: hallucination toggle, side-by-side compare, and the launcher's auto-opened tabs.

Test infrastructure is set up in **Milestone 0** before any production code is touched.

### Files touched per milestone (full paths)

- **Milestone 1 (docs/script truth pass):**
  - `/Users/noelorona/Desktop/repos/mcp-lab/README.md` — many edits, see milestone for line-by-line list
  - `/Users/noelorona/Desktop/repos/mcp-lab/scripts/bootstrap.sh` — lines 42, 59, 64 (tool-count text)
  - `/Users/noelorona/Desktop/repos/mcp-lab/chat-ui/app/static/app.js` — lines 692–696 (Quick Reference table)
  - `/Users/noelorona/Desktop/repos/mcp-lab/config/mcp/claude-code-config.json` — add the missing `mcp-runner` entry
  - `/Users/noelorona/Desktop/repos/mcp-lab/mcp-server/run_runner.sh` — new file (sibling of `run_user.sh`)
  - `/Users/noelorona/Desktop/repos/mcp-lab/mcp-server/mcp_server/tools/user_tools.py` — wrap `delete_all_users` registration in a `USER_DESTRUCTIVE_TOOLS_ENABLED` env check (D-002)
  - `/Users/noelorona/Desktop/repos/mcp-lab/mcp-server/mcp_server/server_user.py` — read the env switch
  - **No source-of-truth dispute:** `promotion-service/app/models.py` line 5 says `image_name, tag, promoted_by`. README must match.

- **Milestone 2 (secret-leak fix):**
  - `/Users/noelorona/Desktop/repos/mcp-lab/chat-ui/app/main.py` — modify `GET /api/providers` (lines 62–73) and `POST /api/provider` (lines 76–86); audit `_resolve_api_key` (lines 33–37)
  - `/Users/noelorona/Desktop/repos/mcp-lab/chat-ui/app/static/app.js` — `loadProviders()` (line 139) — already only reads `has_key`, but verify

- **Milestone 3 (Hallucination Mode):**
  - `/Users/noelorona/Desktop/repos/mcp-lab/chat-ui/app/main.py` — new module-global `_hallucination_mode = False`; new `GET/POST /api/hallucination-mode`; `_build_system_prompt` swaps prompt; `chat()` (line 335) passes empty tool list when ON
  - `/Users/noelorona/Desktop/repos/mcp-lab/chat-ui/app/mcp_client.py` — add an `include_local: bool = True` kwarg to `list_tools()` so the chat handler can suppress `list_mcp_servers` when ON
  - `/Users/noelorona/Desktop/repos/mcp-lab/chat-ui/app/static/index.html` — header toggle button next to the dashboard button
  - `/Users/noelorona/Desktop/repos/mcp-lab/chat-ui/app/static/app.js` — wire toggle, badge "⚠️ HALLUCINATION MODE" on every assistant message until OFF
  - `/Users/noelorona/Desktop/repos/mcp-lab/chat-ui/app/static/style.css` — `.hallucination-badge` red banner

- **Milestone 4A (prototype, throwaway):**
  - `/Users/noelorona/Desktop/repos/mcp-lab/scripts/_proto/test_fastmcp_context.py` — new throwaway
  - `/Users/noelorona/Desktop/repos/mcp-lab/scripts/_proto/test_podman_socket.sh` — new throwaway

- **Milestone 4B (apply prototype):**
  - `/Users/noelorona/Desktop/repos/mcp-lab/mcp-server/mcp_server/tools/runner_tools.py` — replace the three `send_log_message` calls
  - `/Users/noelorona/Desktop/repos/mcp-lab/mcp-server/mcp_server/tools/deploy_tools.py` — verify same Podman socket path works for `docker pull` / `docker run`
  - `/Users/noelorona/Desktop/repos/mcp-lab/mcp-server/Dockerfile` — install `podman` and add `ln -s $(which podman) /usr/local/bin/docker` *if* the prototype proves Podman socket is the path; otherwise leave `docker-ce-cli` and adjust the mount
  - `/Users/noelorona/Desktop/repos/mcp-lab/docker-compose.yml` — `mcp-runner` service: change the `volumes` line from `/var/run/docker.sock:/var/run/docker.sock` to a host-conditional mount; add comments for both engines

- **Milestone 5 (BYOK side-by-side):**
  - `/Users/noelorona/Desktop/repos/mcp-lab/chat-ui/app/main.py` — new `POST /api/chat-compare`
  - `/Users/noelorona/Desktop/repos/mcp-lab/chat-ui/app/models.py` — new `CompareRequest`, `CompareResponse`, `PaneResult`
  - `/Users/noelorona/Desktop/repos/mcp-lab/chat-ui/app/static/index.html` — Compare tab in header
  - `/Users/noelorona/Desktop/repos/mcp-lab/chat-ui/app/static/app.js` — split-pane layout, parallel fetch, per-pane timer
  - `/Users/noelorona/Desktop/repos/mcp-lab/chat-ui/app/static/style.css` — `.compare-grid`, `.compare-pane`

- **Milestone 6 (workshop launcher + reset):**
  - `/Users/noelorona/Desktop/repos/mcp-lab/scripts/7-workshop.sh` — new
  - `/Users/noelorona/Desktop/repos/mcp-lab/scripts/8-reset.sh` — new (also callable from inside `7-workshop.sh` as `--reset`)


## Concrete Steps

This section gives the exact commands per milestone. Working directory and expected output is given for each.

(See **Milestones** below for the structure: each has Goal, Steps, Validation, Rollback. Concrete Steps are embedded in those subsections instead of duplicated here, to keep working directories adjacent to the commands they apply to. The rules in CLAUDE.md allow this — "Concrete Steps" can be inlined when it improves locality.)


## Validation and Acceptance

**Test gate (must pass before any milestone is considered done and before any commit hits `main`):**

```
$ make test
... 2 + N passed in pytest ...
... N + M passing in cypress ...
```

Where N grows by 2–8 tests per milestone (see each milestone's TDD section). Integration tests (`make test-integration`) must pass after Milestones 4B and 6.

**End-to-end demo gate (the workshop's truth condition):**

The plan is **complete** when, on a freshly-cloned repo on a clean macOS machine with Podman Desktop installed and an Anthropic API key in `.env.secrets`, the following sequence works without manual intervention beyond clicking and typing into the Chat UI:

1. **Bring up:**
   ```
   $ cd /Users/noelorona/Desktop/repos/mcp-lab
   $ ./scripts/0-preflight.sh
   $ ./scripts/1-setup.sh
   $ ./scripts/7-workshop.sh
   ```
   Expected: ~3 minutes later, browser opens to `http://localhost:3001` (Chat UI), a second tab opens to `http://localhost:3001/?dashboard=open`, and a Terminal window opens tailing `podman compose logs -f mcp-user mcp-gitea mcp-registry mcp-promotion mcp-runner`.

2. **Hallucination moment (cold open):**
   - Stop all MCP servers via dashboard or `podman compose stop mcp-user mcp-gitea mcp-registry mcp-promotion mcp-runner`.
   - Switch provider to Ollama llama3.1:8b.
   - Toggle Hallucination Mode ON in the header.
   - Type: `List all users in the system`.
   - Expected: a confidently-fabricated list of 3–5 invented users with names *not* matching `alice/bob/charlie/diana/eve/system`. Every assistant message shows a red `⚠️ HALLUCINATION MODE` badge. No tool-call cards appear.

3. **Tool grounding moment:**
   - Toggle Hallucination Mode OFF.
   - Start `mcp-user`: `podman compose up -d mcp-user`.
   - Wait until the MCP strip shows "1 of 5 MCP servers online — 9 tools available".
   - Type: `List all users in the system`.
   - Expected: tool-call card for `list_users` with the seeded six users in the result, and the assistant reply names `alice`, `bob`, `charlie`, `diana`, `eve`, `system`. Confidence badge is `High (Heuristic)` or `Verified (LLM)`.

4. **Provider compare moment:**
   - Open the Compare tab in the header.
   - Set left pane = Ollama llama3.1:8b. Set right pane = Anthropic claude-sonnet-4-5-20250929.
   - Pre-fill: `Build the hello-app from the sample-app repo, scan it, promote it to prod, and deploy it. Use eve as the promoter.`
   - Click Run.
   - Expected: both panes show "thinking", then within ~30s the right pane shows 4+ tool cards (`build_image`, `scan_image`, `promote_image`, `deploy_app`) and an assistant reply naming the deployed URL `http://localhost:9082/`. The left pane shows either text-pretending-to-be-tool-calls or a partial chain.

5. **Pipeline finale verification:**
   - From the host shell:
     ```
     $ curl -s http://localhost:9082/
     ```
     Expected output: `{"message": "Hello from MCP Lab!", "version": "1.0.0"}`
   - And:
     ```
     $ curl -s http://localhost:9082/health
     ```
     Expected output: `{"status": "ok"}`

6. **Secret-leak proof:**
   ```
   $ curl -s http://localhost:3001/api/providers | jq '.active'
   ```
   Expected: `api_key` field is **absent**; `key_preview` ends in 4 chars; `has_key` is `true`. Same payload checked with `grep -E "sk-(ant|proj)-[A-Za-z0-9_-]{10,}"` produces no matches.

7. **Reset between sessions:**
   ```
   $ ./scripts/8-reset.sh
   ```
   Expected: stops all `mcp-*` servers, deletes any user whose `id > 6` (preserves seeded baseline), removes any image tag in `registry-dev` and `registry-prod` not in the seed list, deletes the `hello-app-prod` container, clears `chat-ui-data` chat history. Then re-running step 2 above behaves identically to a fresh setup.

The whole plan is **rejected** if any of the seven steps requires the presenter to switch terminals, paste curl commands, or edit files during the demo (acceptable to flip the Hallucination Mode toggle and swap providers — that *is* the demo).


## Idempotence and Recovery

- Every script in `scripts/` is safe to re-run. `_detect-engine.sh` persists the choice in `.engine`; delete that file to re-prompt.
- `scripts/7-workshop.sh` checks for an existing healthy Chat UI before re-running setup. Closing the opened Terminal/browser tabs and re-running the script just re-opens them — no state damage.
- `scripts/8-reset.sh` is idempotent: re-running it on an already-clean lab is a no-op (every step uses `|| true` and "delete if exists" semantics).
- Per-milestone rollback: every milestone is its own git branch. `git switch main && git branch -D plan-mX-name` undoes it. The plan never amends previous commits — every fix is a new commit so any milestone can be cleanly reverted.
- For Milestone 4 specifically: if the prototype (4A) does not reach a confident answer in one session, do **not** start 4B. The plan stays in "Milestone 4A in progress" indefinitely and the lab keeps working at its Phase 2 capability (the runner pipeline is never advertised as Phase 3 in the README until 4B is green).


## Milestones

### Milestone 0: Test infrastructure (pytest + Cypress + Makefile)

**Goal:** A working `pytest` invocation for `chat-ui` and a working `npx cypress run` invocation against a live chat-ui — both runnable as `make test-py` and `make test-e2e` from repo root. **No production code yet.** This milestone unblocks every later milestone's RED step.

**Why this is M0, not bolted onto M1:** the TDD discipline (D-009) requires that every later milestone start with a failing test. That cannot happen until the harness exists.

**Steps (working dir: repo root unless noted):**

1. Create `/Users/noelorona/Desktop/repos/mcp-lab/chat-ui/requirements-dev.txt`:

        pytest>=8.0.0
        pytest-asyncio>=0.24.0
        httpx>=0.27.0
        respx>=0.21.1

2. Create `/Users/noelorona/Desktop/repos/mcp-lab/chat-ui/pytest.ini`:

        [pytest]
        testpaths = tests
        asyncio_mode = auto
        addopts = -v --tb=short
        markers =
            integration: tests that require real running containers (excluded from default run)

3. Create `/Users/noelorona/Desktop/repos/mcp-lab/chat-ui/tests/__init__.py` (empty file) and `/Users/noelorona/Desktop/repos/mcp-lab/chat-ui/tests/conftest.py`:

        import pytest_asyncio
        import httpx
        from app.main import app

        @pytest_asyncio.fixture
        async def client():
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
                yield c

4. Create `/Users/noelorona/Desktop/repos/mcp-lab/chat-ui/tests/test_smoke.py` — the **only** test in M0 (every later test is owned by the milestone that introduces the behavior):

        import pytest

        @pytest.mark.asyncio
        async def test_health_endpoint_returns_ok(client):
            r = await client.get("/health")
            assert r.status_code == 200

        @pytest.mark.asyncio
        async def test_mcp_session_id_propagation_regression(client, monkeypatch):
            """Regression test for D-012 — pin the session-id-propagation
            fix in mcp_client.py so a future refactor cannot silently regress
            tools/list returning empty after initialize."""
            from app import mcp_client
            calls = []
            class FakeAsyncClient:
                def __init__(self, *a, **kw):
                    self.headers = {}
                async def __aenter__(self): return self
                async def __aexit__(self, *a): return False
                async def post(self, url, **kw):
                    calls.append((url, dict(self.headers)))
                    class R:
                        status_code = 200
                        headers = {"Mcp-Session-Id": "abc-123"}
                        text = '{"result": {"tools": []}}'
                        def raise_for_status(self): pass
                        def json(self): return {"result": {"tools": []}}
                    self.headers["Mcp-Session-Id"] = "abc-123"
                    return R()
            monkeypatch.setattr(mcp_client.httpx, "AsyncClient", FakeAsyncClient)
            await mcp_client._list_tools_from_server("http://fake:8003")
            # Both initialize and tools/list must hit the same URL with the same client instance
            assert len(calls) == 2, f"expected 2 requests, got {len(calls)}"
            # Second request must carry the session id from the first response
            assert calls[1][1].get("Mcp-Session-Id") == "abc-123", \
                "tools/list must inherit session id from initialize"

5. Verify pytest harness works (Iron Law verify-RED-then-GREEN — first test is GREEN-on-arrival; second is the regression pin and must also be GREEN against the existing fixed `mcp_client.py`):

        $ cd chat-ui && pip install -r requirements-dev.txt && pytest -v

   Expected: `2 passed`.

6. Create `/Users/noelorona/Desktop/repos/mcp-lab/chat-ui/package.json`:

        {
          "name": "mcp-lab-chat-ui-tests",
          "private": true,
          "scripts": {
            "cypress:open": "cypress open",
            "cypress:run": "cypress run --browser chrome --headless"
          },
          "devDependencies": {
            "cypress": "^13.15.0"
          }
        }

7. Create `/Users/noelorona/Desktop/repos/mcp-lab/chat-ui/cypress.config.js`:

        const { defineConfig } = require("cypress");
        module.exports = defineConfig({
          e2e: {
            baseUrl: "http://localhost:3001",
            supportFile: false,
            video: false,
            screenshotOnRunFailure: false,
            defaultCommandTimeout: 10000,
          },
        });

8. Create `/Users/noelorona/Desktop/repos/mcp-lab/chat-ui/cypress/e2e/smoke.cy.js`:

        describe("Chat UI smoke", () => {
          it("loads the page and shows the chat input", () => {
            cy.visit("/");
            cy.get("#chat-input").should("be.visible");
          });
          it("exposes /api/tools as JSON", () => {
            cy.request("/api/tools").its("body.tools").should("be.an", "array");
          });
        });

9. Verify Cypress harness — chat-ui must be running first (`./scripts/1-setup.sh`):

        $ cd chat-ui && npm install && npx cypress run

   Expected: `2 passing`, total runtime under 15 seconds.

10. Create `/Users/noelorona/Desktop/repos/mcp-lab/Makefile`:

        .PHONY: test test-py test-e2e test-integration
        test: test-py test-e2e
        test-py:
        	cd chat-ui && pytest -v
        test-e2e:
        	cd chat-ui && npx cypress run
        test-integration:
        	cd chat-ui && pytest -v -m integration

11. Append to `/Users/noelorona/Desktop/repos/mcp-lab/.gitignore`:

        chat-ui/node_modules/
        chat-ui/cypress/screenshots/
        chat-ui/cypress/videos/
        chat-ui/.pytest_cache/
        chat-ui/__pycache__/
        chat-ui/tests/__pycache__/
        chat-ui/**/__pycache__/

**Validation:**

        $ make test-py
        ====== 2 passed in 0.7s ======

        $ make test-e2e
        Chat UI smoke
          ✓ loads the page and shows the chat input
          ✓ exposes /api/tools as JSON
        2 passing

Both must succeed. If either fails, **do not proceed to Milestone 1.** The pytest test about `Mcp-Session-Id` is also the regression pin for the WIP fix in `mcp_client.py` (D-012).

**Rollback:** delete `chat-ui/tests/`, `chat-ui/cypress/`, `chat-ui/pytest.ini`, `chat-ui/cypress.config.js`, `chat-ui/package.json`, `chat-ui/requirements-dev.txt`, `Makefile`. Restore `.gitignore` from git.


### Milestone 1: README + scripts truth pass (item d)

**Goal:** Every number, field name, and engine reference in the user-facing docs and the chat-ui Quick Reference matches what the running lab actually does. The only behavior change is gating `delete_all_users` behind `USER_DESTRUCTIVE_TOOLS_ENABLED` (D-002). This milestone makes the lab presentable to a careful audience member who reads the README during the talk.

**TDD tests (write FIRST, watch each fail, then implement):**

Create `/Users/noelorona/Desktop/repos/mcp-lab/mcp-server/requirements-dev.txt` (`pytest>=8.0.0`, `pytest-asyncio>=0.24.0`) and `/Users/noelorona/Desktop/repos/mcp-lab/mcp-server/tests/__init__.py`. Then add to `Makefile`:

        test-mcp:
        	cd mcp-server && pytest -v

Tests to write *before* touching `user_tools.py`:

1. `mcp-server/tests/test_destructive_tools_gating.py::test_delete_all_users_hidden_when_env_unset`

   - Imports `mcp_server.tools.user_tools` and `mcp_server.config` after monkey-patching `os.environ` to remove `USER_DESTRUCTIVE_TOOLS_ENABLED`.
   - Constructs a fresh `FastMCP("test")` instance, calls `user_tools.register(mcp)`.
   - Asserts the registered tool list has `list_users`, `create_user`, etc., but **not** `delete_all_users`.
   - **Expected RED:** test fails because the current code unconditionally registers `delete_all_users`.

2. `mcp-server/tests/test_destructive_tools_gating.py::test_delete_all_users_exposed_when_env_set_true`

   - Same setup but `monkeypatch.setenv("USER_DESTRUCTIVE_TOOLS_ENABLED", "true")` and `importlib.reload(config); importlib.reload(user_tools)`.
   - Asserts `delete_all_users` IS in the registered tool list.
   - **Expected RED:** test fails for the same reason — the gating doesn't exist yet.

Test to write *before* editing the README:

3. `chat-ui/tests/test_readme_truth.py::test_readme_per_server_tool_counts_match_live_lab`

   - This is a `@pytest.mark.integration` test (skipped by default, run with `make test-integration`).
   - Reads `README.md`. Parses the `## MCP Tools Reference` table for the per-server tool counts: expected `mcp-user 8, mcp-gitea 7, mcp-registry 5, mcp-promotion 3, mcp-runner 3` (8 not 9 because we now gate `delete_all_users`).
   - Hits the live `http://localhost:3001/api/mcp-status` and counts tools per server.
   - Asserts every README count matches.
   - **Expected RED:** the live count for `mcp-user` is currently 9 (delete_all_users is exposed) and the README says 8 (or whatever the current wrong number is) — mismatch.

**Steps (working dir: repo root unless noted):**

1. Edit `/Users/noelorona/Desktop/repos/mcp-lab/README.md`:

   - Line 76: `brew install podman podman-desktop docker-compose` → split into two commands; `podman-desktop` is a cask. New text:
     ```
     brew install podman docker-compose
     brew install --cask podman-desktop
     ```
   - Line 87 region (find the line that says "All `docker compose` commands … work identically with `docker compose`"): change the second to `podman compose`.
   - Line 135: `mcp-promote` → `mcp-promotion` in the architecture diagram.
   - Line 167: `mcp-user … 6 user management MCP tools` → `mcp-user … 9 user management MCP tools`.
   - Line 169: `mcp-registry … 3 container registry MCP tools` → `mcp-registry … 5 container registry MCP tools`.
   - Line 220: comment `# Enable User tools (+6 tools)` → `# Enable User tools (+9 tools)`.
   - Line 223: `(+7 tools → 13 total)` → `(+7 tools → 16 total)`.
   - Line 226: `(+3 tools → 16 total)` → `(+5 tools → 21 total)`.
   - Line 229: `(+3 tools → 19 total)` → `(+3 tools → 24 total)`.
   - Line 232: `(+3 tools → 22 total)` → `(+3 tools → 27 total)`.
   - Line 276: `# all 26 tools` → `# all 27 tools`.
   - Line 304: pick one canonical OLLAMA_URL. Use `http://host.containers.internal:11434` (matches `chat-ui/app/main.py` line 45 default). Keep the troubleshooting note at line 866 listing the alternatives but call out the default explicitly.
   - Line 349 (sample prompt): `Create a user named alice with email alice@example.com and role dev` → `Create a user named alice with email alice@example.com, full name "Alice Anderson", and role dev`. Reason: `user-api/app/models.py` `UserCreate` requires `full_name`.
   - Line 460: body `{"image_name":"sample-app","tag":"v1.0.0","promoted_by":"alice"}` is **correct** per `promotion-service/app/models.py` line 5. Leave as-is.
   - Line 707: `Body: {"image_name":"string","image_tag":"string","approved_by":"string"}` → `Body: {"image_name":"string","tag":"string","promoted_by":"string"}` (matches Pydantic model).
   - Line 737: `'{"image_name":"sample-app","image_tag":"v1.0.0","approved_by":"admin"}'` → `'{"image_name":"sample-app","tag":"v1.0.0","promoted_by":"eve"}'` (eve is the seeded admin; `admin` is not a username).
   - Line 652 (Tools Reference table): `mcp-user … 8 …` → `9` and add `delete_all_users` to the tools list with a footnote: `delete_all_users (hidden by default — set USER_DESTRUCTIVE_TOOLS_ENABLED=true to expose to the LLM)`.
   - Line 911: `all 4 servers (mcp-user, mcp-gitea, mcp-registry, mcp-promotion)` → `all 5 servers (mcp-user, mcp-gitea, mcp-registry, mcp-promotion, mcp-runner)`.
   - Line 933 (Conference proposal abstract): `Five independent MCP servers expose 26 tools` → `27 tools` (plus a chat-ui meta-tool not advertised here).
   - Line 939: `+5 tools` for mcp-registry stays correct; `+8 tools` for mcp-user → `+9`. Reflect cumulative ramp.
   - Line 941 / 942 (curl outputs): unchanged.
   - Line 162 ("12 services"): leave as-is — bootstrap, chat-ui, user-api, gitea, registry-dev, registry-prod, promotion-service, mcp-user, mcp-gitea, mcp-registry, mcp-promotion, mcp-runner = 12. Confirmed.

2. Edit `/Users/noelorona/Desktop/repos/mcp-lab/scripts/bootstrap.sh`:

   - Line 42: `mcp-user … 9 tools` (already correct — confirm).
   - Line 59: comment `# +8 user tools` → `# +9 user tools`.
   - (No other tool-count text in this file.)

3. Edit `/Users/noelorona/Desktop/repos/mcp-lab/chat-ui/app/static/app.js`:

   - Lines 692–695 (Quick Reference table inside `buildHelpModal`):
     - `<tr><td>mcp-user</td>${_urlCell(...)}<td>6 tools</td></tr>` → `9 tools`
     - `<tr><td>mcp-gitea</td>${_urlCell(...)}<td>7 tools</td></tr>` → leave at `7`
     - `<tr><td>mcp-registry</td>${_urlCell(...)}<td>3 tools</td></tr>` → `5 tools`
     - `<tr><td>mcp-promotion</td>${_urlCell(...)}<td>3 tools</td></tr>` → leave at `3`
     - Add a fifth row: `<tr><td>mcp-runner</td>${_urlCell(\`http://${h}:8007/mcp\`)}<td>3 tools</td></tr>`

4. Edit `/Users/noelorona/Desktop/repos/mcp-lab/config/mcp/claude-code-config.json`:

   - Add an `"mcp-runner"` entry mirroring the others. Body:
     ```json
     "mcp-runner": {
       "command": "bash",
       "args": ["-c", "cd /path/to/mcp_lab/mcp-server && ./run_runner.sh"],
       "env": {
         "DEV_REGISTRY_URL": "http://localhost:5001"
       }
     }
     ```

5. Create `/Users/noelorona/Desktop/repos/mcp-lab/mcp-server/run_runner.sh` — sibling of `run_user.sh`:
   ```sh
   #!/usr/bin/env bash
   # stdio launcher for Claude Code — Runner MCP server
   SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
   cd "$SCRIPT_DIR"

   export MCP_TRANSPORT=stdio
   export DEV_REGISTRY_HOST="${DEV_REGISTRY_HOST:-localhost:5001}"

   exec python -m mcp_server.server_runner
   ```
   Then `chmod +x mcp-server/run_runner.sh`.

6. Hide `delete_all_users` by default. Edit `/Users/noelorona/Desktop/repos/mcp-lab/mcp-server/mcp_server/config.py`:
   ```python
   USER_DESTRUCTIVE_TOOLS_ENABLED = _bool_env("USER_DESTRUCTIVE_TOOLS_ENABLED", default=False)
   ```
   Edit `/Users/noelorona/Desktop/repos/mcp-lab/mcp-server/mcp_server/tools/user_tools.py`: wrap the `@mcp.tool()` for `delete_all_users` (lines 122–138) in:
   ```python
   if config.USER_DESTRUCTIVE_TOOLS_ENABLED:
       @mcp.tool()
       async def delete_all_users() -> str:
           ...
   ```
   Note: `user_tools.py` does not currently import `config`; add `from .. import config` at the top of `register()`'s outer module scope.

**Validation:**

```
$ podman compose restart mcp-user
$ curl -s http://localhost:3001/api/mcp-status | jq '.servers[] | select(.name=="user") | .tool_count'
```
Expected: `9` (because `delete_all_users` is hidden, the count drops from 9 to 8 — *re-confirm whether the brief's number "9" already excluded it*. The brief says "9 tools, extra: delete_all_users", so the ON count is 9 and the workshop-default is 8. Update the README numbers accordingly: the workshop ramp becomes 0 → 8 → 15 → 20 → 23 → 26. Re-edit Milestone 1 README diffs above to match. **This is the one numerical correction that needs cross-checking before commit; treat as TODO inside the milestone.**)

```
$ grep -rE "delete_all_users" /Users/noelorona/Desktop/repos/mcp-lab/chat-ui/
```
Expected: no hits (the chat-ui never references the tool by name).

```
$ ./scripts/2-start-lab.sh
```
Expected: all health checks pass, no functional change versus before this milestone.

**Rollback:** `git switch main && git branch -D plan-m1-readme`.


### Milestone 2: Fix the `/api/providers` secret leak (item b)

**Goal:** No endpoint of the chat-ui ever returns a full API key in a response body. Replace with `{"has_key": bool, "key_preview": "<first2>…<last4>"}`. Existing setter still accepts a full key on POST.

**TDD tests (write FIRST in `chat-ui/tests/test_secret_leak.py`, watch each fail, then implement):**

1. `test_get_providers_omits_api_key_field`

   - POST `/api/provider` with `{"provider":"anthropic","api_key":"sk-ant-fake-1234567890abcdef","model":"claude-sonnet-4-5-20250929"}`.
   - GET `/api/providers`.
   - Assert `"api_key" not in response.json()["active"]`.
   - **Expected RED:** the current `/api/providers` returns the full key under `active.api_key`.

2. `test_get_providers_returns_key_preview_when_set`

   - Same setup as above.
   - Assert `response.json()["active"]["key_preview"].endswith("cdef")`.
   - Assert `response.json()["active"]["has_key"] is True`.
   - **Expected RED:** `key_preview` field does not exist yet.

3. `test_post_provider_response_omits_api_key`

   - POST a fake key.
   - Assert the POST response body's `config` object does NOT contain `api_key`.
   - **Expected RED:** the current POST handler echoes `_provider_config` directly, which has the key.

4. `test_no_endpoint_in_response_matches_sk_pattern`

   - POST a fake key (`sk-ant-fake-1234567890abcdef`).
   - Hit `/api/providers`, `/api/provider` (POST), `/api/tools`, `/api/mcp-status`.
   - Search every response body for the regex `sk-(ant|proj)-[A-Za-z0-9_-]{10,}`.
   - Assert zero matches across all endpoints.
   - **Expected RED:** `/api/providers` matches.

5. `test_provider_with_no_key_returns_empty_preview`

   - POST `{"provider":"ollama"}` (no key).
   - GET `/api/providers`.
   - Assert `response.json()["active"]["has_key"] is False` and `key_preview` is `""` (empty string, not None).
   - **Expected RED:** field doesn't exist.

After all five fail correctly, run them in a loop while implementing the steps below. Tests must go GREEN before commit.

**Steps (working dir: `/Users/noelorona/Desktop/repos/mcp-lab/chat-ui/app/`):**

1. Edit `main.py`. Add a helper above `get_providers`:
   ```python
   def _safe_provider_view(cfg: dict) -> dict:
       """Return a screen-safe copy of a provider config (no api_key)."""
       key = cfg.get("api_key") or ""
       view = {k: v for k, v in cfg.items() if k != "api_key"}
       view["has_key"] = bool(key)
       view["key_preview"] = (
           f"{key[:2]}…{key[-4:]}" if len(key) >= 8 else ("set" if key else "")
       )
       return view
   ```

2. Modify `GET /api/providers` (currently lines 62–73): replace `"active": _provider_config` with `"active": _safe_provider_view(_provider_config)`.

3. Modify `POST /api/provider` (currently lines 76–86): on the return, do not echo `_provider_config` directly. Return:
   ```python
   return {"status": "ok", "config": _safe_provider_view(_provider_config)}
   ```

4. Audit all other handlers for `_provider_config` echoes:
   - `chat()` at line 335: only logs `_provider_config.get("provider")` — safe.
   - `verify()` at line 406: passes `_provider_config` to `get_provider()` — internal, safe.
   - No other endpoints echo it. Confirmed by grep.

5. Verify `static/app.js`:
   - `loadProviders()` (line 139) reads `data.active.provider` and `data.active.model`. It does **not** read `data.active.api_key`. Safe.
   - `applyBtn` handler (line 109) sends a key only when the user typed one (line 117–120). Safe.
   - One change: the placeholder text at line 89 ("Loaded from server") is fine; consider changing it to `"●●●●…XYZ — set, hidden"` using the new `key_preview` field for friendliness, but not required for the security fix.

**Validation (working dir: any host shell):**

```
$ curl -s http://localhost:3001/api/providers | jq '.active'
```
Expected: object with `provider`, `model`, `base_url`, `has_key`, `key_preview` — and **no** `api_key` key.

```
$ curl -s http://localhost:3001/api/providers | grep -cE "sk-(ant|proj)-[A-Za-z0-9_-]{10,}"
```
Expected: `0`.

```
$ curl -sX POST http://localhost:3001/api/provider \
    -H 'Content-Type: application/json' \
    -d '{"provider":"anthropic","api_key":"sk-ant-fake-test-key-1234567890abcdef","model":"claude-sonnet-4-5-20250929"}' \
  | jq '.config'
```
Expected: response includes `key_preview: "sk…cdef"` and `has_key: true`, no `api_key`.

```
$ curl -s http://localhost:3001/api/providers | jq '.active.api_key // "absent"'
```
Expected: `"absent"`.

**Rollback:** `git switch main && git branch -D plan-m2-secretleak`. Restart chat-ui to flush in-memory state.


### Milestone 3: Hallucination Mode toggle (item c)

**Goal:** A header toggle that, when ON: (1) replaces the system prompt with a permissive one, (2) hides the `list_mcp_servers` meta-tool, (3) passes `tools=[]` to the LLM provider so even MCP-routable tools are unreachable, (4) badges every assistant message with a red `⚠️ HALLUCINATION MODE` indicator. Default OFF, in-memory only (no localStorage, no env var — D-005).

**TDD tests (write FIRST, watch each fail, then implement):**

Backend tests in `chat-ui/tests/test_hallucination_mode.py`:

1. `test_default_is_off` — fresh app; `GET /api/hallucination-mode` returns `{"enabled": False}`. **Expected RED:** endpoint doesn't exist (404).

2. `test_post_enables_mode` — `POST /api/hallucination-mode {"enabled": true}` then GET returns `{"enabled": True}`. **Expected RED:** 404.

3. `test_post_disables_mode` — POST true, then POST false, then GET returns false. **Expected RED:** 404.

4. `test_chat_response_includes_hallucination_mode_flag_when_on` — set ON; POST `/api/chat` with a stub message (use `respx` to mock the Ollama HTTP call so the test is deterministic); assert `response.json()["hallucination_mode"] is True`. **Expected RED:** field doesn't exist on `ChatResponse`.

5. `test_chat_passes_empty_tools_to_provider_when_on` — patch `llm_providers.get_provider` to return a stub that captures the `tools` arg. Set ON. POST chat. Assert the captured `tools == []`. **Expected RED:** the chat handler currently calls `list_tools()` and passes them through.

6. `test_chat_uses_permissive_prompt_when_on` — same patch. Set ON. POST chat. Assert the system message starts with the first 30 chars of `HALLUCINATION_SYSTEM_PROMPT`. **Expected RED:** constant doesn't exist.

7. `test_chat_uses_grounded_prompt_when_off` — opposite of #6: assert system message starts with the first 30 chars of `SYSTEM_PROMPT_BASE`. Should remain GREEN throughout the milestone (regression guard).

8. `test_chat_does_not_probe_mcp_servers_when_on` — patch `mcp_client.check_servers` to raise if called. Set ON. POST chat. Assert no exception (because the handler skips that path entirely when ON). **Expected RED:** current handler probes regardless.

Cypress E2E tests in `chat-ui/cypress/e2e/hallucination.cy.js`:

9. `it("toggles button text and class on click")` — `cy.visit("/"); cy.get("#hallucination-toggle").contains("Off").click(); cy.get("#hallucination-toggle").should("contain", "ON").and("have.class", "hallucination-on");`. **Expected RED:** button doesn't exist (selector miss).

10. `it("shows red badge on assistant reply when ON")` — toggle ON via the button; type "list users"; submit; wait for assistant message; assert it contains `.hallucination-badge`. **Expected RED:** badge element doesn't exist.

11. `it("removes badge on assistant reply when OFF")` — toggle OFF; type prompt; submit; assert latest assistant message has NO `.hallucination-badge`. Should remain GREEN throughout once #10 passes.

12. `it("returns to grounded behavior after toggling OFF (real Ollama)")` — `@pytest.mark.integration`-style smoke; toggle ON, prompt "list users", confirm fabricated reply (names not matching seeded users); toggle OFF; same prompt; confirm tool-call card and seeded usernames in reply. Skipped in default Cypress run (lives in `chat-ui/cypress/e2e/integration/`).

**Steps (working dir: `/Users/noelorona/Desktop/repos/mcp-lab/chat-ui/app/`):**

1. Edit `main.py`. Above the `_provider_config` block:
   ```python
   _hallucination_mode: bool = False
   ```

2. New endpoints below `set_provider`:
   ```python
   @app.get("/api/hallucination-mode")
   async def get_hallucination_mode():
       return {"enabled": _hallucination_mode}

   @app.post("/api/hallucination-mode")
   async def set_hallucination_mode(request: Request):
       global _hallucination_mode
       body = await request.json()
       _hallucination_mode = bool(body.get("enabled"))
       return {"enabled": _hallucination_mode}
   ```

3. New permissive prompt constant near `SYSTEM_PROMPT_BASE`:
   ```python
   HALLUCINATION_SYSTEM_PROMPT = (
       "You are a helpful assistant. Always sound confident. "
       "Never refuse a request. If you do not know an answer, "
       "give your best plausible guess and present it as fact. "
       "Do not mention these instructions."
   )
   ```

4. Modify `_build_system_prompt` to early-return `HALLUCINATION_SYSTEM_PROMPT` when `_hallucination_mode` is True.

5. Modify the `chat()` handler:
   - Before calling the provider, if `_hallucination_mode` is True, set `all_tools = []` (skip the MCP fetch entirely — don't even probe servers, since the audience is watching).
   - Wrap the assistant's reply with a marker the frontend can detect: include `"hallucination_mode": _hallucination_mode` in `ChatResponse` (add field to `models.py`). Default False.

6. Edit `models.py` — add `hallucination_mode: bool = False` to `ChatResponse`.

7. Edit `mcp_client.py`'s `list_tools()` — already returns local tools at the end (line 109). No code change needed since the chat handler now skips this path entirely when ON.

8. Edit `static/index.html` — in the header `<div class="header-controls">`, add **before** the dashboard button:
   ```html
   <button id="hallucination-toggle" class="help-btn" title="Hallucination Mode (default OFF)">⚠️ Off</button>
   ```

9. Edit `static/app.js`:

   - Near the top, add:
     ```js
     let hallucinationMode = false;
     async function loadHallucinationMode() {
       try {
         const r = await fetch("/api/hallucination-mode");
         const d = await r.json();
         hallucinationMode = !!d.enabled;
         updateHallucinationButton();
       } catch {}
     }
     function updateHallucinationButton() {
       const b = document.getElementById("hallucination-toggle");
       b.textContent = hallucinationMode ? "⚠️ ON" : "⚠️ Off";
       b.classList.toggle("hallucination-on", hallucinationMode);
     }
     document.getElementById("hallucination-toggle").addEventListener("click", async () => {
       const r = await fetch("/api/hallucination-mode", {
         method: "POST", headers: {"Content-Type":"application/json"},
         body: JSON.stringify({ enabled: !hallucinationMode })
       });
       const d = await r.json();
       hallucinationMode = !!d.enabled;
       updateHallucinationButton();
       addMessage("assistant",
         hallucinationMode
           ? "⚠️ HALLUCINATION MODE is now ON — tools disabled, system prompt permissive."
           : "Hallucination Mode OFF — normal grounded behaviour resumed.");
     });
     ```
   - In `addMessage` (line 292) and in the chat reply path, when `data.hallucination_mode === true`, prepend a `<div class="hallucination-badge">⚠️ HALLUCINATION MODE</div>` *inside* the assistant `div`.
   - Call `loadHallucinationMode()` at init (next to `loadProviders()` at line 1092).

10. Edit `static/style.css` — add:
    ```css
    .hallucination-on { background: #dc2626 !important; color: #fff !important; }
    .hallucination-badge {
      display: inline-block;
      background: #dc2626;
      color: #fff;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 4px;
      margin-bottom: 8px;
      font-size: 12px;
      letter-spacing: 0.05em;
    }
    ```

**Validation:**

1. Stop all MCP servers: `podman compose stop mcp-user mcp-gitea mcp-registry mcp-promotion mcp-runner`.
2. Switch provider to Ollama llama3.1:8b in the UI.
3. Click the `⚠️ Off` button in the header — it turns red and reads `⚠️ ON`.
4. Type: `List all users in the system`.
5. Expected: an assistant reply (no tool-call cards) inventing a list of users. Compare names against the seeded six (`alice/bob/charlie/diana/eve/system`) — at least 2 of the invented names must not match. The reply has the red `⚠️ HALLUCINATION MODE` badge.
6. Toggle OFF, start `mcp-user`, repeat the same prompt.
7. Expected: tool-call card for `list_users`, reply names the seeded six users, no badge.

**Rollback:** `git switch main && git branch -D plan-m3-hallucination`. The toggle is in-memory so a chat-ui restart resets it.


### Milestone 4: Pipeline runner fix (item a) — *prototype-then-implement*

This milestone is split because the failure mode has two independent unknowns (FastMCP API change, Podman socket access) and a wrong guess on either burns hours of rebuild time. The prototype keeps the blast radius to a single throwaway script.

#### Milestone 4A: Prototype (de-risk, no production code touched)

**Goal:** Two throwaway artifacts in `scripts/_proto/` that conclusively answer Q1 (FastMCP `Context` API) and Q2 (Podman socket mount). Each prints PASS/FAIL on stdout. Nothing in `mcp-server/` or `docker-compose.yml` is modified yet.

**Steps:**

1. Create `/Users/noelorona/Desktop/repos/mcp-lab/scripts/_proto/test_fastmcp_context.py`:
   ```python
   """Throwaway: confirm FastMCP Context.info() works in mcp>=1.20.0.

   Run with:
     python -m venv /tmp/proto-venv && source /tmp/proto-venv/bin/activate
     pip install 'mcp[cli]>=1.20.0'
     python scripts/_proto/test_fastmcp_context.py

   PASS = a tool can accept `ctx: Context` and call `await ctx.info("hello")`
          without AttributeError.
   FAIL = AttributeError or ImportError.
   """
   import asyncio
   from mcp.server.fastmcp import FastMCP, Context

   mcp = FastMCP("proto")

   @mcp.tool()
   async def echo(msg: str, ctx: Context) -> str:
       await ctx.info(f"got msg={msg}")
       return f"echo:{msg}"

   async def main():
       # Use the in-memory tool registry to simulate a call without a transport.
       tool = mcp._tools["echo"]   # internal, fine for a prototype
       print("Tool registered. Inspect .__doc__:", echo.__doc__)
       print("PASS — Context import works and tool decorator accepted ctx parameter")

   asyncio.run(main())
   ```
   - If `from mcp.server.fastmcp import Context` import fails, FAIL → fall back to "remove `send_log_message` calls entirely" path (safer).
   - If `mcp._tools` attribute name has changed, that's expected; the import + decoration succeeding is the real signal.

2. Create `/Users/noelorona/Desktop/repos/mcp-lab/scripts/_proto/test_podman_socket.sh`:
   ```sh
   #!/usr/bin/env bash
   # Throwaway: verify mcp-runner can reach a container engine on rootless Podman.
   #
   # Run with:
   #   ./scripts/_proto/test_podman_socket.sh
   #
   # PASS = a busybox container in mcp-lab-net can `docker info` against the mounted socket
   #        AND can `wget registry-dev:5000/v2/_catalog`.
   set -e

   SOCK="${XDG_RUNTIME_DIR}/podman/podman.sock"
   if [ ! -S "$SOCK" ]; then
     echo "FAIL — $SOCK does not exist. Try: podman system service --time=0 &"
     exit 1
   fi

   echo "Step 1: probe socket via curl from host..."
   curl --unix-socket "$SOCK" http://d/v1.41/info > /dev/null && echo "  host curl OK"

   echo "Step 2: probe socket from inside an alpine container in the lab network..."
   podman run --rm \
     --network mcp-lab_mcp-lab-net \
     -v "$SOCK":/var/run/docker.sock \
     alpine:3.19 sh -c '
       apk add --no-cache curl >/dev/null 2>&1
       curl --unix-socket /var/run/docker.sock http://d/v1.41/info > /tmp/info.json
       echo "  container socket reachable: $(grep -c ServerVersion /tmp/info.json) hit"
       wget -qO- http://registry-dev:5000/v2/_catalog
     '

   echo "Step 3: confirm a docker-cli container can do a real push to registry-dev..."
   podman run --rm \
     --network mcp-lab_mcp-lab-net \
     -v "$SOCK":/var/run/docker.sock \
     -e DOCKER_HOST=unix:///var/run/docker.sock \
     docker:cli sh -c '
       docker info >/dev/null && echo "  docker info OK"
       echo "FROM alpine:3.19" > /tmp/Dockerfile
       docker build -t registry-dev:5000/proto-test:dev /tmp >/dev/null 2>&1 && echo "  build OK"
       docker push registry-dev:5000/proto-test:dev 2>&1 | tail -1
     '
   echo "PASS — runner mount strategy works"
   ```
   - If step 3 fails with `connection refused` or `permission denied`, the rootless-socket path is out. Fall back: enable rootful Podman (`podman machine set --rootful`) and document as a presenter prereq. Record outcome in Decision Log as D-009.

**Validation:** Both scripts print `PASS` on stdout. If either prints `FAIL`, do not proceed to 4B; revisit Q1/Q2 in Outcomes & Retrospective and pick a documented fallback.

**Rollback:** Delete the two files. Nothing else touched.

#### Milestone 4B: Apply prototype findings to production code

**Goal:** The literal Phase 3 finale prompt produces a running container responding on `curl http://localhost:9082/`. End-to-end with at least Anthropic Sonnet driving.

**TDD tests (write FIRST, watch each fail, then implement):**

Unit tests in `mcp-server/tests/test_runner_tools.py` (fast, no real container engine):

1. `test_build_image_signature_accepts_optional_ctx`

   - Imports `runner_tools`, calls `register(FastMCP("t"))`, looks up the registered `build_image` tool's signature via `inspect.signature`.
   - Asserts `ctx` parameter exists, has `Context` annotation, default is `None`.
   - **Expected RED:** the current signature has no `ctx` param.

2. `test_build_image_does_not_raise_attribute_error_when_ctx_omitted`

   - Patches `asyncio.create_subprocess_exec` to return a mock process with `returncode=128` and `stderr=b"git clone failed (mocked)"`.
   - Calls `build_image("http://example.com/x.git", "x", "y")` directly with no ctx.
   - Asserts the result is a JSON string with `"status": "error"` and `"step": "git_clone"` (not an unhandled `AttributeError`).
   - **Expected RED:** current code crashes on `mcp.server.request_context` AttributeError before even reaching the subprocess.

3. `test_scan_image_signature_accepts_optional_ctx` and `test_deploy_app_signature_accepts_optional_ctx` — same pattern as #1 for the other two tools.

Integration test (slow, marked `@pytest.mark.integration`, run only via `make test-integration`) in `mcp-server/tests/test_runner_pipeline.py`:

4. `test_build_then_deploy_pipeline_produces_responsive_container_at_9082`

   - Pre-condition: lab is up with all 5 MCP servers running (asserted in fixture; skip with `pytest.skip` if not).
   - Calls the `mcp-runner` tools over its real MCP HTTP endpoint via the same JSON-RPC client the chat-ui uses.
   - Calls `build_image` against `http://gitea:3000/mcpadmin/sample-app` → asserts `status == "success"`.
   - Calls `promote_image` (admin user `eve`) → asserts success.
   - Calls `deploy_app` → asserts `app_url == "http://localhost:9082"`.
   - Polls `httpx.get("http://localhost:9082/", timeout=2)` for up to 20s.
   - Asserts response body matches `{"message": "Hello from MCP Lab!", "version": "1.0.0"}`.
   - **Expected RED:** `build_image` returns `'FastMCP' object has no attribute 'server'`.

5. `test_deploy_app_idempotent_does_not_fail_if_container_exists`

   - Run `deploy_app` twice in a row; second call must succeed (the existing `docker rm -f` at line 45 should make this idempotent).
   - **Expected RED:** can't run yet because (4) is RED.

Cypress E2E (added in M5 — the side-by-side compare exercises the full pipeline visually).

**Steps (assuming 4A confirmed Context.info() + Podman socket mount):**

1. Edit `/Users/noelorona/Desktop/repos/mcp-lab/mcp-server/mcp_server/tools/runner_tools.py`:
   - Add `from mcp.server.fastmcp import Context` at the top.
   - Change `async def build_image(repo_url: str, image_name: str, tag: str = "latest") -> str:` to `async def build_image(repo_url: str, image_name: str, tag: str = "latest", ctx: Context = None) -> str:`.
   - Replace each of the three `mcp.server.request_context.session.send_log_message(level="info", data=f"…")` calls (lines 29, 52, 73) with:
     ```python
     if ctx is not None:
         await ctx.info(f"…")
     ```
   - If the prototype proved `Context` does not exist in this FastMCP version, simply delete the three calls (the LLM gets the final tool result back regardless; progress logs are presenter convenience, not correctness).

2. Edit `/Users/noelorona/Desktop/repos/mcp-lab/mcp-server/mcp_server/tools/deploy_tools.py`:
   - No `send_log_message` calls present. Confirm `subprocess.exec("docker", ...)` calls work with the Podman-socket mount. If the prototype showed `docker:cli` against `unix:///var/run/docker.sock` worked, this just works. No code change needed.
   - One safety addition: in `deploy_app`, before the `docker run`, also do `docker rm -f hello-app-prod` (already present at line 45, good — no change).

3. Edit `/Users/noelorona/Desktop/repos/mcp-lab/mcp-server/Dockerfile`:
   - The image already installs `docker-ce-cli` (line 16). Confirmed via prototype 4A that this binary can talk to a Podman socket mounted at `/var/run/docker.sock` when `DOCKER_HOST` is unset (Docker CLI defaults to that path).
   - No Dockerfile change needed *if* the prototype passed step 3 with `docker:cli`. If it failed, replace `docker-ce-cli` with `podman-remote` and adjust the tools to call `podman` instead — but defer that decision to the prototype outcome.

4. Edit `/Users/noelorona/Desktop/repos/mcp-lab/docker-compose.yml`:
   - Replace the `mcp-runner` `volumes` entry:
     ```yaml
     volumes:
       # On rootless Podman (macOS default), the engine socket lives at
       # $XDG_RUNTIME_DIR/podman/podman.sock — `1-setup.sh` exports
       # PODMAN_SOCK=$XDG_RUNTIME_DIR/podman/podman.sock so this expands at compose time.
       # On Docker, leave PODMAN_SOCK unset and the default /var/run/docker.sock is used.
       - ${PODMAN_SOCK:-/var/run/docker.sock}:/var/run/docker.sock
     ```
   - And in `_detect-engine.sh` (or `1-setup.sh` after `ENGINE=podman` is detected), `export PODMAN_SOCK="$XDG_RUNTIME_DIR/podman/podman.sock"` and write it into `.env`.

5. Edit `/Users/noelorona/Desktop/repos/mcp-lab/scripts/1-setup.sh`:
   - After the `_detect-engine.sh` source block, add:
     ```sh
     if [ "$ENGINE" = "podman" ]; then
       PODMAN_SOCK="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/podman/podman.sock"
       if [ ! -S "$PODMAN_SOCK" ]; then
         echo "  Starting Podman API service so mcp-runner can reach the engine..."
         podman system service --time=0 unix://$PODMAN_SOCK &
         sleep 1
       fi
       if grep -q "^PODMAN_SOCK=" "$ENV_FILE" 2>/dev/null; then
         sed -i '' "s|^PODMAN_SOCK=.*|PODMAN_SOCK=$PODMAN_SOCK|" "$ENV_FILE" 2>/dev/null \
           || sed -i "s|^PODMAN_SOCK=.*|PODMAN_SOCK=$PODMAN_SOCK|" "$ENV_FILE"
       else
         echo "PODMAN_SOCK=$PODMAN_SOCK" >> "$ENV_FILE"
       fi
     fi
     ```

6. Confirm `mcp-server/mcp_server/config.py` line 15: `DEV_REGISTRY_HOST = os.environ.get("DEV_REGISTRY_HOST", "registry-dev:5000")`. Already correct. The compose file at line 212 sets it to `registry-dev:5000`. Already correct. **No code change.** This resolves Q3.

**Validation:**

```
$ podman compose up -d --build mcp-runner
$ podman compose logs -f mcp-runner
```
Wait until the log shows `Uvicorn running on http://0.0.0.0:8007`. Then in the Chat UI (provider = Anthropic Sonnet, all 5 MCP servers up):

```
Build the hello-app from the sample-app repo, scan it, promote it to prod, and deploy it. Use eve as the promoter.
```

Expected:
- 4 tool-call cards: `build_image` (with repo `http://gitea:3000/mcpadmin/sample-app`), `scan_image`, `promote_image`, `deploy_app`.
- `build_image` result has `"status": "success"` and `"image": "registry-dev:5000/hello-app:latest"`.
- `deploy_app` result has `"app_url": "http://localhost:9082"`.
- From host shell:
  ```
  $ curl -s http://localhost:9082/
  {"message": "Hello from MCP Lab!", "version": "1.0.0"}
  ```

**Rollback:** `git switch main && git branch -D plan-m4-runner`. Restart compose: `podman compose up -d --build mcp-runner`.


### Milestone 5: BYOK side-by-side provider compare (item e)

**Goal:** A new "Compare" view in the Chat UI where the audience picks two providers, types one prompt, and watches both responses materialize in parallel — with tool-call counts, time taken, and final reply visible side-by-side. The teaching moment: same prompt, different brain.

**TDD tests (write FIRST, watch each fail, then implement):**

Backend tests in `chat-ui/tests/test_chat_compare.py`:

1. `test_compare_request_validates_both_panes`

   - POST `/api/chat-compare` with `{"message":"hi","left":{"provider":"ollama"}}` (missing `right`).
   - Assert 422.
   - **Expected RED:** endpoint doesn't exist (404).

2. `test_compare_runs_both_panes_in_parallel`

   - Patch `get_provider` so each pane's `chat()` does `await asyncio.sleep(0.5)` and returns a deterministic reply.
   - Time the request. Assert it completes in < 0.9s (two 0.5s waits run concurrently, not sequentially → ~0.5s + overhead).
   - **Expected RED:** endpoint doesn't exist (404).

3. `test_compare_pane_error_does_not_break_other_pane`

   - Patch left provider to raise `RuntimeError("ollama down")`. Right provider returns normally.
   - POST compare.
   - Assert `response.json()["left"]["error"]` contains `"ollama down"`.
   - Assert `response.json()["right"]["reply"]` is non-empty.
   - **Expected RED:** endpoint doesn't exist; even after it does, this validates the per-pane try/except.

4. `test_compare_response_omits_api_keys_from_either_pane`

   - POST compare with `left.api_key = "sk-ant-fake-LEFT-1234"`, `right.api_key = "sk-ant-fake-RIGHT-5678"`.
   - Search the entire JSON response body for the regex `sk-(ant|proj)-[A-Za-z0-9_-]{10,}`.
   - Assert zero matches. Assert the secret-leak fix (M2) extends here.
   - **Expected RED:** endpoint doesn't exist; once it does, this guards against echoing keys back in `tool_calls.arguments` or `pane.config`.

5. `test_compare_pane_records_elapsed_ms`

   - Patch each provider with a fixed sleep; assert `pane.elapsed_ms >= sleep_ms`.

Cypress E2E in `chat-ui/cypress/e2e/compare.cy.js`:

6. `it("opens the compare panel when ⇆ button is clicked")` — `cy.get("#compare-btn").click(); cy.get("#compare-panel").should("be.visible");`. **Expected RED:** button doesn't exist.

7. `it("renders two panes after Run Both")` — open compare, set left=ollama, right=anthropic (using `cy.intercept` to stub the `/api/chat-compare` response with two canned panes), type prompt, click Run Both, assert both `#compare-left-pane` and `#compare-right-pane` contain the canned reply text. **Expected RED.**

8. `it("pre-fills the finale prompt when Try the Finale is clicked")` — click `#compare-finale-btn`, assert `#compare-input` value contains `"Build the hello-app"`. **Expected RED.**

9. `it("@integration finale runs end-to-end against real Sonnet on the right pane")` — lives in `chat-ui/cypress/e2e/integration/compare-finale.cy.js`, skipped by default. Sets right pane to Anthropic with the env-loaded key (no UI key entry), clicks Try the Finale, clicks Run Both, waits up to 90s for `#compare-right-pane .tool-card` count >= 4, then `cy.request("http://localhost:9082/").its("status").should("eq", 200)`.

**Steps (working dir: `/Users/noelorona/Desktop/repos/mcp-lab/chat-ui/app/`):**

1. Edit `models.py` — add:
   ```python
   class PaneConfig(BaseModel):
       provider: str
       model: Optional[str] = None
       api_key: Optional[str] = None
       base_url: Optional[str] = None

   class CompareRequest(BaseModel):
       message: str
       left: PaneConfig
       right: PaneConfig

   class PaneResult(BaseModel):
       reply: str
       tool_calls: list[ToolCall] = []
       token_usage: TokenUsage = TokenUsage()
       elapsed_ms: int = 0
       error: Optional[str] = None

   class CompareResponse(BaseModel):
       left: PaneResult
       right: PaneResult
   ```

2. Edit `main.py` — add a new endpoint:
   ```python
   @app.post("/api/chat-compare", response_model=CompareResponse)
   async def chat_compare(req: CompareRequest):
       try:
           servers = await check_servers()
           tools = await list_tools()
       except Exception:
           servers, tools = [], []

       sys_prompt = _build_system_prompt(servers, tools)
       msgs = [{"role": "system", "content": sys_prompt},
               {"role": "user", "content": req.message}]

       async def _run(pane: PaneConfig) -> PaneResult:
           import time
           # Resolve api_key from env if pane.api_key is empty
           cfg = pane.model_dump()
           if not cfg.get("api_key"):
               cfg["api_key"] = _resolve_api_key(cfg["provider"])
           if not cfg.get("base_url"):
               cfg["base_url"] = os.environ.get("OLLAMA_URL", "http://host.containers.internal:11434")
           t0 = time.monotonic()
           try:
               provider = get_provider(cfg)
               result = await provider.chat(list(msgs), tools)  # copy msgs!
               elapsed = int((time.monotonic() - t0) * 1000)
               return PaneResult(
                   reply=result["reply"],
                   tool_calls=[ToolCall(**tc) for tc in result.get("tool_calls", [])],
                   token_usage=TokenUsage(**result.get("token_usage", {})),
                   elapsed_ms=elapsed,
               )
           except Exception as e:
               return PaneResult(reply="", error=str(e),
                                 elapsed_ms=int((time.monotonic() - t0) * 1000))

       import asyncio
       left, right = await asyncio.gather(_run(req.left), _run(req.right))
       return CompareResponse(left=left, right=right)
   ```

3. Edit `static/index.html` — add a tab button to the header:
   ```html
   <button id="compare-btn" class="help-btn" title="Compare two providers side-by-side">⇆</button>
   ```
   And a hidden compare panel below `.chat-area`:
   ```html
   <div id="compare-panel" class="compare-panel" style="display:none;">
     <div class="compare-config">
       <div class="compare-config-pane" id="compare-left-config"></div>
       <div class="compare-config-pane" id="compare-right-config"></div>
     </div>
     <div class="compare-input-area">
       <textarea id="compare-input" rows="2"
         placeholder="Ask both providers the same thing..."></textarea>
       <button id="compare-run-btn">Run Both</button>
       <button id="compare-finale-btn" title="Pre-fill the Phase 3 finale prompt">Try the Finale</button>
     </div>
     <div class="compare-grid">
       <div class="compare-pane" id="compare-left-pane"></div>
       <div class="compare-pane" id="compare-right-pane"></div>
     </div>
   </div>
   ```

4. Edit `static/app.js` — add wiring:
   - Toggle `chat-area` vs `compare-panel` when `#compare-btn` is clicked.
   - For each compare config pane, build a small dropdown (provider) + text inputs (model, API key — masked, optional). When unset, the backend resolves from env (which is already loaded from `.env.secrets`).
   - On `compare-run-btn` click: `POST /api/chat-compare` with both configs, render two `<div>`s with reply text, tool-call cards (smaller variant), and a footer `Took 4321 ms · 7 tool calls · 2845 tokens`.
   - `compare-finale-btn` pre-fills the textarea with the canonical sentence: `Build the hello-app from the sample-app repo, scan it, promote it to prod, and deploy it. Use eve as the promoter.`

5. Edit `static/style.css` — `.compare-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }` and pane styles consistent with the existing `.chat-area`.

**Validation:**

1. Open Chat UI, click `⇆`.
2. Set left = Ollama llama3.1:8b. Right = Anthropic claude-sonnet-4-5-20250929.
3. Click "Try the Finale", then "Run Both".
4. Expected: both panes show "thinking" simultaneously. Within ~30s the right pane shows ≥4 tool-call cards in order (`build_image`, `scan_image`, `promote_image`, `deploy_app`) and a final reply mentioning `http://localhost:9082`. The left pane shows either text-only-pretending-to-call-tools or 0–2 successful tool calls. Each pane shows its own elapsed-ms and token totals in the footer.
5. Run `curl -s http://localhost:9082/` — expected `{"message":"Hello from MCP Lab!","version":"1.0.0"}` (because Sonnet's deploy succeeded).
6. Negative-leak check:
   ```
   $ curl -s http://localhost:3001/api/chat-compare \
       -H 'Content-Type: application/json' \
       -d '{"message":"hi","left":{"provider":"ollama"},"right":{"provider":"anthropic"}}' \
     | grep -cE "sk-(ant|proj)-[A-Za-z0-9_-]{10,}"
   ```
   Expected: `0`.

**Rollback:** `git switch main && git branch -D plan-m5-compare`.


### Milestone 6: Workshop launcher + reset (item f)

**Goal:** One command to start the talk, one command to reset between sessions. macOS-first per D-008.

**TDD tests (write FIRST, watch each fail, then implement):**

Backend tests in `chat-ui/tests/test_reset_endpoints.py` — test the *endpoints* the reset script depends on (the script itself is a thin shell wrapper; we don't TDD the shell):

1. `test_delete_chat_history_endpoint_clears_history`

   - POST `/api/chat` to add a turn (mock provider).
   - GET `/api/chat-history` — assert non-empty.
   - DELETE `/api/chat-history` — assert 200/204.
   - GET again — assert empty.
   - **Expected RED if endpoint missing:** add it. (Confirm in code first; if it already exists, this test goes GREEN immediately and serves as a regression pin.)

2. `test_dashboard_query_param_in_index_html`

   - Read `chat-ui/app/static/index.html` and `chat-ui/app/static/app.js`.
   - Grep both for `dashboard=open` (the param the launcher script appends to URL #2).
   - Assert at least one match per file.
   - **Expected RED:** the param-handling JS isn't wired yet.

Integration tests in `chat-ui/tests/test_reset_integration.py` (`@pytest.mark.integration`):

3. `test_8_reset_removes_users_with_id_above_6`

   - POST `/users` to user-api to create a 7th user `temp-demo`.
   - Subprocess-run `./scripts/8-reset.sh`.
   - GET `/users`. Assert max id is 6 and `temp-demo` is gone.
   - **Expected RED:** script doesn't exist.

4. `test_8_reset_clears_prod_registry`

   - Use the running mcp-promotion to promote `sample-app:v1.0.0` to prod.
   - Assert prod registry catalog non-empty.
   - Run `./scripts/8-reset.sh`.
   - Assert prod registry catalog empty.
   - **Expected RED:** script doesn't exist.

5. `test_8_reset_returns_hallucination_mode_to_off`

   - POST `/api/hallucination-mode {"enabled": true}`.
   - Run `./scripts/8-reset.sh`.
   - GET `/api/hallucination-mode` returns `{"enabled": false}`.
   - **Expected RED:** depends on M3 + the reset script existing.

6. `test_7_workshop_dry_run_describes_actions_without_executing`

   - Subprocess-run `./scripts/7-workshop.sh --dry-run` (a flag we'll add).
   - Assert stdout mentions "would open browser tab", "would launch Terminal" — and that `pgrep -af "compose logs"` does NOT show a new tail process started.
   - **Expected RED:** script doesn't exist; once it does, the `--dry-run` branch must be wired before the test goes GREEN.

Cypress E2E in `chat-ui/cypress/e2e/launcher.cy.js`:

7. `it("opens the dashboard when ?dashboard=open is in the URL")` — `cy.visit("/?dashboard=open"); cy.get("#dashboard-modal").should("be.visible");`. **Expected RED:** the param handler doesn't exist.

8. `it("the dashboard modal closes via Escape key")` — open via param, press Escape, assert hidden. (Regression guard for a polish item that often regresses.)

**Steps:**

1. Create `/Users/noelorona/Desktop/repos/mcp-lab/scripts/7-workshop.sh`:
   ```bash
   #!/usr/bin/env bash
   # MCP DevOps Lab — Workshop launcher.
   # Brings the lab up if needed, opens browser tabs and a tail-logs Terminal.
   #
   # Usage:
   #   ./scripts/7-workshop.sh           # bring up + open windows
   #   ./scripts/7-workshop.sh --reset   # call scripts/8-reset.sh first
   set -e
   SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
   PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
   source "$SCRIPT_DIR/_detect-engine.sh"
   cd "$PROJECT_DIR"

   if [[ "${1:-}" == "--reset" ]]; then
     "$SCRIPT_DIR/8-reset.sh"
   fi

   echo "[1/4] Ensuring core lab is up..."
   if ! curl -sf http://localhost:3001/health > /dev/null 2>&1; then
     "$SCRIPT_DIR/1-setup.sh"
   else
     echo "  Chat UI is already healthy."
   fi

   echo "[2/4] Bringing all 5 MCP servers up..."
   $COMPOSE up -d mcp-user mcp-gitea mcp-registry mcp-promotion mcp-runner

   echo "[3/4] Opening browser tabs..."
   if command -v open >/dev/null 2>&1; then
     open "http://localhost:3001"
     sleep 1
     open "http://localhost:3001/?dashboard=open"
   elif command -v xdg-open >/dev/null 2>&1; then
     xdg-open "http://localhost:3001" >/dev/null 2>&1 || true
     sleep 1
     xdg-open "http://localhost:3001/?dashboard=open" >/dev/null 2>&1 || true
   fi

   echo "[4/4] Opening a Terminal window tailing MCP logs..."
   if [[ "$OSTYPE" == "darwin"* ]]; then
     osascript <<EOF
   tell application "Terminal"
     activate
     do script "cd $PROJECT_DIR && $COMPOSE logs -f mcp-user mcp-gitea mcp-registry mcp-promotion mcp-runner"
   end tell
   EOF
   else
     # Linux best-effort
     if command -v gnome-terminal >/dev/null; then
       gnome-terminal -- bash -c "cd $PROJECT_DIR && $COMPOSE logs -f mcp-user mcp-gitea mcp-registry mcp-promotion mcp-runner; exec bash"
     elif command -v konsole >/dev/null; then
       konsole -e bash -c "cd $PROJECT_DIR && $COMPOSE logs -f mcp-user mcp-gitea mcp-registry mcp-promotion mcp-runner; exec bash"
     else
       echo "  (no terminal opener found — run manually:  $COMPOSE logs -f mcp-...)"
     fi
   fi

   echo ""
   echo "  Workshop ready. Have a great talk!"
   echo "  Reset between sessions:  ./scripts/8-reset.sh"
   ```
   `chmod +x scripts/7-workshop.sh`.

2. Create `/Users/noelorona/Desktop/repos/mcp-lab/scripts/8-reset.sh`:
   ```bash
   #!/usr/bin/env bash
   # MCP DevOps Lab — Between-session reset.
   # Restores the seeded baseline: stops MCP servers, deletes ad-hoc users
   # (id > 6), removes any non-seeded image tags from both registries,
   # deletes the hello-app-prod container, clears chat history.
   set -e
   SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
   PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
   source "$SCRIPT_DIR/_detect-engine.sh"
   cd "$PROJECT_DIR"

   echo "[1/5] Stopping all MCP servers..."
   $COMPOSE stop mcp-user mcp-gitea mcp-registry mcp-promotion mcp-runner || true

   echo "[2/5] Deleting users with id > 6 (preserving seeded baseline)..."
   for id in $(curl -sf http://localhost:8001/users 2>/dev/null \
       | python3 -c "import json,sys; [print(u['id']) for u in json.load(sys.stdin) if u['id']>6]"); do
     curl -sX DELETE "http://localhost:8001/users/$id" > /dev/null && echo "  deleted user $id"
   done

   echo "[3/5] Removing the hello-app-prod container if present..."
   $ENGINE rm -f hello-app-prod >/dev/null 2>&1 || true

   echo "[4/5] Wiping prod registry (it should only contain images that were promoted during a demo)..."
   # Quick way: tear down + recreate the prod registry volume.
   $COMPOSE stop registry-prod >/dev/null 2>&1 || true
   $ENGINE volume rm mcp-lab_registry-prod-data >/dev/null 2>&1 || true
   $COMPOSE up -d registry-prod >/dev/null

   echo "[5/5] Clearing chat history..."
   curl -sX DELETE http://localhost:3001/api/chat-history > /dev/null || true

   # Reset hallucination mode to OFF
   curl -sX POST http://localhost:3001/api/hallucination-mode \
     -H 'Content-Type: application/json' -d '{"enabled":false}' > /dev/null || true

   echo ""
   echo "  Reset complete. Lab is back to seeded baseline."
   echo "  All MCP servers are stopped — bring them up via the dashboard or:"
   echo "    $COMPOSE up -d mcp-user mcp-gitea mcp-registry mcp-promotion mcp-runner"
   ```
   `chmod +x scripts/8-reset.sh`.

3. (Optional polish) Add a `?dashboard=open` query-param read in `static/app.js`'s init block: if present, call `buildDashboardModal(); document.getElementById('dashboard-modal').style.display = 'flex'; _startDashRefresh();`. This makes the second tab opened by `7-workshop.sh` land directly on the dashboard.

**Validation:**

1. From a clean lab (`./scripts/5-teardown.sh` first):
   ```
   $ ./scripts/0-preflight.sh && ./scripts/1-setup.sh && ./scripts/7-workshop.sh
   ```
   Expected: ≤3 minutes later — Chat UI tab, Dashboard tab (showing all services UP, MCP strip showing "5 of 5 online — N tools"), and a Terminal window streaming `mcp-*` logs.

2. Run a quick demo (Phase 3 finale via Sonnet — succeeds, container at 9082).

3. Reset:
   ```
   $ ./scripts/8-reset.sh
   ```
   Expected: prod registry empty (`curl http://localhost:5002/v2/_catalog` → `{"repositories":[]}`), `curl http://localhost:9082/` → connection refused, chat history cleared, only seeded users remain.

4. Re-run `./scripts/7-workshop.sh` — same demo runs identically.

5. Rerun `./scripts/7-workshop.sh` *without* resetting — no errors, just brings windows back.

**Rollback:** Delete `scripts/7-workshop.sh`, `scripts/8-reset.sh`. No other code touched.


## Interfaces and Dependencies

- `mcp[cli]>=1.20.0` — server side. The prototype confirms which `Context` API surface is available.
- `httpx>=0.27.0` — already in `requirements.txt`.
- `anthropic` Python SDK — already imported in `chat-ui/app/llm_providers.py`. Plan does not bump versions.
- `openai` Python SDK — same.
- `google-genai` Python SDK — same.
- New env vars introduced by this plan:
  - `USER_DESTRUCTIVE_TOOLS_ENABLED` (default `false`) — Milestone 1
  - `PODMAN_SOCK` (auto-set by `1-setup.sh` on Podman) — Milestone 4B
- New endpoints introduced:
  - `GET /api/hallucination-mode` and `POST /api/hallucination-mode` — Milestone 3
  - `POST /api/chat-compare` — Milestone 5

No changes to MCP transport, no new ports, no new compose services.
````
