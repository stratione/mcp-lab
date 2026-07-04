# Learn Mode + Module 8 — Design

Approved by Noe on 2026-07-03 ("yes" to the package: Learn Mode overlay, Module 8
build-your-own-MCP, mental-model quick wins).

## Goal

Make the lab feel like a modern guided learning platform (KodeKloud-style) while
keeping the existing chat UI fully intact behind a toggle, and close the biggest
MCP learning gap: learners consume 33 tools but never author one.

## Non-goals

- No rewrite of the existing chat UI. Classic mode stays pixel-identical.
- No gamification beyond progress tracking (no points, streaks, badges).
- No new container services. Everything rides existing chat-ui + labctl.

## Part 1 — Learn Mode overlay (chat-ui)

A toggleable course shell. Header button (and `⌘L`) flips `learnMode` in the
zustand store (persisted). Off = today's UI, untouched.

Layout when ON (three columns):

- **Left rail (~250px):** course navigation. 8 modules, each with step
  checkmarks and a module progress ring. Clicking a module loads its lesson.
- **Center (flex):** lesson pane. Steps rendered as cards: goal text, copyable
  command blocks, expected output, and a **Verify** button per module that runs
  the real module check server-side and shows PASS/FAIL + hint.
- **Right (~420px):** the existing ChatPane + InputRow docked as the agent
  copilot. "By hand first, then by agent" becomes the literal screen layout.

Visual theme: Learn Mode sets `data-mode="learn"` on `<html>`; globals.css
provides a token override set (deep indigo/night palette, violet accent,
softer surfaces). Classic tokens unchanged. All colors stay in the existing
CSS-variable system so shadcn primitives inherit automatically.

Curriculum content lives in `chat-ui/web/src/features/learn/curriculum.ts` as
typed data (modules → steps → commands/expected/verify), distilled from
docs/CURRICULUM.md. CURRICULUM.md remains the long-form canonical text; the
in-app lesson is the workshop-time driver.

### Progress + Verify backend

- `GET/POST /api/curriculum/progress` — JSON blob persisted in the existing
  chat-ui Docker volume (same pattern as chat-history).
- `POST /api/curriculum/check/{module}` — runs the same check functions as
  `./labctl check <n>`. The stdlib-only `labctl_pkg` is vendored into the
  chat-ui image; a thin ctx adapter points it at Docker-internal URLs
  (gitea:3000, registry-dev:5000, promotion-service:8002). Module 6 (engine
  `ps`) reuses the engine access the backend already has for `/api/mcp-control`.

## Part 2 — Module 8: Build your own MCP tool

New curriculum module, same by-hand-first arc:

1. **By hand — speak raw MCP:** `curl` JSON-RPC against a running server:
   `initialize` → `tools/list` → `tools/call`. Learner sees the wire protocol.
2. **By hand — author a tool:** `mcp-server/mcp_server/custom_tools.py` ships
   with a documented skeleton. Learner writes a real tool (suggested:
   `pipeline_health` — one-call status across registries + promotion audit),
   rebuilds the mcp-user container, watches the tool appear in the UI.
3. **By agent:** ask the LLM to use the new tool; iterate on the docstring and
   watch tool-selection change — teaches "docstring is the prompt."
4. **Verify:** `./labctl check 8` — tools/list on mcp-user must contain at
   least one tool beyond the stock manifest.

## Part 3 — Mental-model quick wins

- Flying Blind copy: "it **will** confidently make things up" → "may" (banner +
  help text) — TODO.md acceptance finding.
- Startup system diagram: on first visit (localStorage flag) auto-open the
  existing Architecture dialog so learners form the mental model before the
  cold open.

## Risks

- Curriculum distillation is the big content lift; steps must match
  CURRICULUM.md commands exactly (copy, don't paraphrase).
- Vendored labctl ctx must not drift: single source stays `labctl-cli/labctl_pkg`,
  copied at image build, never forked.
- Learn Mode must not regress classic mode: App.tsx branches at the top level;
  classic path renders the exact current tree.

## Acceptance

- Toggle Learn Mode on/off: classic UI unchanged when off.
- Learn Mode: navigate all 8 modules, copy a command, click Verify on module 1
  → PASS with detail string from the labctl check.
- Progress survives a browser reload and a container restart (volume).
- `./labctl check 8` fails before the learner writes a tool, passes after.
- Flying Blind banner reads "may"; Architecture dialog opens on first visit.
- Verified in running containers (docker compose build + up, browser check).
