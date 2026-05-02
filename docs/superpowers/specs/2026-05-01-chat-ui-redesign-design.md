# chat-ui Redesign — Design Spec

**Date:** 2026-05-01
**Status:** Approved for implementation planning
**Scope:** Frontend rewrite of `chat-ui/app/static/` only. Backend (FastAPI), MCP server, all other docker-compose services, and the workshop flow are unchanged.

## Purpose / Big Picture

Replace the current 1,619-line vanilla JS / 1,791-line CSS single-file chat UI with a small Vite + React + TypeScript + Tailwind + shadcn/ui frontend. The lab itself (8 services, 20 MCP tools, every `/api/*` endpoint) does not change. What changes is how visible the lab is to the learner: a persistent right-rail inspector replaces the current stack of six modals, a corner menu collapses secondary chrome, and a ⌘K command palette gives keyboard-first access to every action. A density control (Compact / Comfortable / Large + slider) lets workshop attendees on laptops adapt the same UI that runs on the presenter's projector.

## Non-Goals

- No backend changes. No new endpoints, no schema changes, no streaming refactor.
- No SSE / streaming responses in v1. The existing `/api/chat` is buffered; v1 matches that.
- No multi-user / multi-session features. Single-tab, single-conversation behavior preserved.
- No new lab content, no new MCP tools, no docker-compose changes other than chat-ui Dockerfile.
- No feature flag, no `/v2` route, no parallel old-and-new shipping. One PR swaps the static dir.

## Audience

1. **Workshop attendees** on laptops following along — primary. Need readable type at laptop distance and ability to bump font size for their setup.
2. **Workshop presenter** on a projector — secondary. Defaults are tuned for a projector-friendly experience.
3. **Daily lab developers** — tertiary. Power-user paths via ⌘K.

## Tech Stack

| Concern | Choice | Why |
| --- | --- | --- |
| Build | Vite 5 | Fastest dev loop, native TS, ESM-first |
| Framework | React 18 | Largest ecosystem; shadcn/ui depends on it |
| Language | TypeScript (strict) | Catches contract drift at compile time |
| CSS | Tailwind 3 | Utility-first; theme-token mapping to CSS variables |
| Component library | shadcn/ui (Radix primitives + Tailwind) | Generates source we own; accessible by default |
| Server state | TanStack Query | Caching, polling, retries handled |
| UI state | Zustand | Tiny, ergonomic, no provider tree noise |
| Validation | zod | Runtime schema check at the API boundary |
| Routing | None (single page) | App is one screen |
| Testing | Vitest + React Testing Library + existing Cypress + axe-core | Reuses infra |

Shipped runtime: static HTML/JS/CSS. No Node at runtime. FastAPI continues serving `app/static` exactly as today.

## Repository Layout

```
chat-ui/
├── app/                         # existing FastAPI — UNTOUCHED
│   ├── main.py                  # /api/chat, /api/tools, /api/mcp-status, ...
│   └── static/                  # ← Vite build output drops here
│       ├── index.html
│       └── assets/
├── web/                         # NEW: Vite + React frontend source
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx              # two-pane shell
│   │   ├── components/          # Header, ChatPane, Inspector, CmdK, CornerMenu, ...
│   │   ├── components/ui/       # shadcn-generated primitives
│   │   ├── features/            # chat/, servers/, tools/, trace/, compare/, settings/
│   │   ├── lib/api.ts           # typed wrappers for /api/*
│   │   ├── lib/store.ts         # zustand
│   │   ├── lib/schemas.ts       # zod schemas for every API response
│   │   └── styles/globals.css
│   ├── index.html
│   ├── vite.config.ts           # build.outDir = '../app/static'
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   └── package.json             # frontend-scoped, separate from cypress root
├── tests/                       # existing pytest — untouched
├── cypress/                     # existing — selectors updated for new DOM
├── package.json                 # root: cypress only
└── Dockerfile                   # multi-stage: node:22-alpine build → python runtime
```

## Information Architecture

Two-pane shell: chat on the left, persistent inspector on the right. Five of the six current modals (help, schema, compare, dashboard, mcp-details) are eliminated — their content moves into inspector tabs or inline UI. The walkthrough overlay is kept as a first-run guided tour. Settings live in two popovers (provider chip in the input row; corner ⋯ menu in the header), not modals.

```
┌─────────────────────────────────────────────────────────────────────┐
│  [logo] MCP DevOps Lab                                          ⋯   │  Header (brand + corner menu)
├──────────────────────────────────┬──────────────────────────────────┤
│                                  │  Servers · Tools · Trace · Compare│  Inspector tabs
│  user:    Promote nginx:dev…     │  ──────────────────────────────  │
│                                  │  ● user-api      :8001  verify   │
│  [tool] promote_image ✓ 312ms ▾  │  ● gitea         :3000  verify   │
│                                  │  ● registry-dev  :5000  verify   │
│  asst:    Promoted nginx…        │  ● registry-prod :5001  verify   │
│                                  │                                  │
│                                  │                                  │
├──────────────────────────────────┴──────────────────────────────────┤
│  [⬩ ollama · llama3.1 · 2,481 tok ▾]   Ask the lab…       [Send]   │  Input row
└─────────────────────────────────────────────────────────────────────┘
```

### Header (2 elements)

- **Brand:** logo mark + "MCP DevOps Lab".
- **Corner menu (⋯)** at top-right. Pulldown contains: theme segmented (Light / Dark / System) · density segmented + fine-tune slider (Compact / Comfortable / Large) · Flying Blind switch with explainer · Walkthrough · Clear chat · Keyboard shortcuts · ⌘K hint.

### Input row (bottom, persistent)

- **Provider chip** (left of textarea): shows current provider · model · session token total. Click → popover with provider select, model input, API key, token counter, "Test connection".
- **Textarea** with auto-grow.
- **Send button** (becomes Stop while a response is in-flight; uses `AbortController`).

### Inspector tabs

- **Servers** — every MCP-adjacent service: status dot, name, port, latency, inline `verify` button. Replaces today's bottom MCP strip + Lab Dashboard modal. Verify-curl results render inline in the row.
- **Tools** — all 20 MCP tools, grouped by category (User · 7, Gitea · 7, Registry · 3, Promotion · 3). Click row → drawer with full JSON schema + a "Try it" form. Replaces schema modal.
- **Trace** — session-wide timeline of every tool call (timestamp · name · duration · status). Click row → scroll chat to the originating message. Filterable by tool/server.
- **Compare** — splits the inspector into two stacked mini-chats. Each pane has independent provider/model and Flying Blind toggle. Same prompt → both panes via `/api/chat-compare`. Replaces compare modal.

## Visual Language ("Docs" Direction)

Inspired by Stripe/Linear documentation aesthetics: clean, neutral, professional, low chrome. Reads as a real tool, not a toy chatbot.

- **Typography:** Inter (system fallback) for UI, JetBrains Mono for code/identifiers/tool names. Tight letter-spacing (-0.01em) on display sizes. Body 15px (Comfortable default).
- **Surfaces:** hairline 1px borders, 7–10px corner radii, subtle elevation on popovers only.
- **Color tokens** (Tailwind theme extends with these):
  - Light: `--bg #fafafa`, `--surface #fff`, `--border #e5e5e5`, `--text #0a0a0a`, `--muted #525252`, `--primary #0a0a0a`, `--user-bubble #0a0a0a` on white.
  - Dark: `--bg #0a0a0a`, `--surface #0f0f10`, `--border #262626`, `--text #fafafa`, `--muted #a3a3a3`, `--primary #fafafa`, `--user-bubble #fafafa` on black.
  - Status: `--ok #22c55e` (light: `#16a34a`), `--warn #f59e0b`, `--err #ef4444`.
  - Tool chip: `bg rgba(99,102,241,.18)` / `fg #a5b4fc` (dark); `bg #dbeafe` / `fg #1d4ed8` (light).
- **User bubble** = high-contrast solid (black on light, white on dark). **Assistant message** = surface with hairline border. **Tool call** = compact line, not a bubble.
- **Default mode:** dark. Light alt available; system mode follows OS preference. Persisted to `localStorage`.

## Density Control

Single CSS custom property `--ui-scale` drives the entire type and spacing ramp via `calc(base * var(--ui-scale))`. Tailwind plugin generates the scaled ramp.

| Preset | Scale | Body size | Use case |
| --- | --- | --- | --- |
| Compact | 0.85× | ~13px | Power users, dense screens |
| Comfortable | **1.00×** (default) | 15px | Workshop laptops |
| Large | 1.18× | ~18px | Projector / accessibility |

- Slider under the segmented control writes any value 0.7×–1.4× to `--ui-scale`.
- Keyboard: `⌘ +` / `⌘ −` cycle presets, `⌘ 0` resets to 1.0×.
- Persisted to `localStorage` alongside theme.
- No layout shift: container widths stay fixed, line-heights and gaps scale with type.

## Component Anatomy

### Chat message variants

- **`<UserMessage>`** — text content, right-aligned solid bubble, max-width 75%.
- **`<ToolCallSummary>`** — single line: tool chip · monospace name · ✓/✗ status · duration · token count · expand chevron. Default collapsed.
- **`<ToolCallExpanded>`** — pretty-printed JSON args + result, syntax-highlighted via Shiki, copy buttons. Truncates at ~2KB with "show more"; full payload always copyable.
- **`<AssistantMessage>`** — text + inline code + lists. Surface background, hairline border. Markdown rendered via `react-markdown` with `remark-gfm`.
- **`<MessageList>`** — virtualized only if > 100 messages (unlikely in workshop sessions); auto-scroll to bottom on new content unless user has scrolled up.

### ⌘K command palette (cmdk)

Fuzzy filter across four groups:

- **Suggestions:** Switch provider, Switch model, Toggle theme, Toggle Flying Blind.
- **Navigation:** Focus inspector → Servers / Tools / Trace / Compare.
- **Tools (20):** every MCP tool by name; selecting one opens its drawer in the Tools tab.
- **Session:** Clear chat, Open walkthrough, Set density, Show keyboard shortcuts.

Keyboard shortcuts (also visible in the `?` cheatsheet):

| Shortcut | Action |
| --- | --- |
| `⌘ K` | Open command palette |
| `⌘ J` | Toggle theme |
| `⇧ ⌘ H` | Toggle Flying Blind |
| `⌘ +` / `⌘ −` / `⌘ 0` | Density bump / reset |
| `⇧ ⌘ ⌫` | Clear chat |
| `?` | Show shortcuts cheatsheet |
| `Esc` | Close any popover / palette |

## Data Flow

The existing `/api/chat` returns a buffered `ChatResponse` with `reply`, `tool_calls[]`, `token_usage`, `confidence`, `hallucination_mode`. Provider/model/api_key are **server-side state** (set via separate `/api/provider` POST). Hallucination mode is also server-side (`/api/hallucination-mode` POST). Verified shape at `chat-ui/app/models.py:10` and `chat-ui/app/main.py:385`. v1 matches this without backend changes:

1. **On provider settings change** (popover Apply): POST `/api/provider` with `{provider, api_key?, model?, base_url?}` — succeeds before any chat is allowed.
2. **On Flying Blind toggle** (corner menu): POST `/api/hallucination-mode` with `{enabled}` and refetch state from GET `/api/hallucination-mode` to confirm.
3. **On send**: optimistic-render the user message → show typing indicator → POST `/api/chat` with `{message, history}` (the only fields the backend accepts).
4. **On response**: render assistant message, render any `tool_calls[]` as `<ToolCallSummary>` lines inline above the assistant text.
5. Append to chat history via existing `/api/chat-history` POST.
6. Update session token counter from `token_usage.total_tokens`.

**Stop button:** `AbortController` aborts the in-flight request; if a partial state exists, render it tagged "(stopped)".

**Polling cadence (TanStack Query):**

| Query | Endpoint | Cadence |
| --- | --- | --- |
| MCP status | `/api/mcp-status` | 30s focused / 3s if any server offline / paused on blur |
| Tools catalog | `/api/tools` | once per session, 5-min stale |
| Providers | `/api/providers` | once per session |
| Chat history | `/api/chat-history` | on mount, then push-only |

**Verify-curl:** POST `/api/probe` with the server name; result inline in the Servers row. Replaces the existing `tool_verify.js` helper.

**Compare:** POST `/api/chat-compare`; render two `<ChatPane>` instances bound to the two response halves.

**SSE upgrade:** documented but not in v1. Path: FastAPI `StreamingResponse` with `text/event-stream`, frontend `EventSource`. Add when the backend grows it.

## Error Handling

| Failure | UX |
| --- | --- |
| Network / 5xx on `/api/chat` | Toast "Couldn't reach the lab"; failed message shows inline retry button. |
| Provider auth (401/403) | Toast "API key looks wrong"; auto-open provider popover with key field focused. |
| Tool call error (HTTP 4xx surfaced) | `<ToolCallSummary>` renders red ✗ + inline error message; assistant message still renders. |
| MCP server down | Server row shows red dot; Servers tab gets a count badge; one-line banner under the input ("registry-prod is down · click to verify"). |
| zod validation failure on any response | Console error + non-blocking toast "Backend response shape changed — please reload." |
| Hallucination mode active | High-contrast warning band across the chat pane: "⚠ Flying Blind — no tools, no probes". Cannot be missed. |

## Persistence

| Item | Where | Why |
| --- | --- | --- |
| Provider · model · API key | `localStorage` | Matches today's behavior |
| Theme · density | `localStorage` | Per-device preference |
| Chat history | `/api/chat-history` (existing) | Server-side as today |
| Token counter (session) | Zustand (in-memory) | Resets on reload as today |

## Build & Ship

### Local dev

Two terminals:

```
$ cd chat-ui && uvicorn app.main:app --reload --port 3001
$ cd chat-ui/web && npm run dev   # Vite on :5173, proxies /api/* and /health to :3001
```

### Build

```
$ cd chat-ui/web && npm run build
# outputs to ../app/static/{index.html, assets/}
```

### Docker

`chat-ui/Dockerfile` becomes multi-stage:

```dockerfile
FROM node:22-alpine AS web-builder
WORKDIR /web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM python:3.12-slim
# (existing python setup, docker-cli install, etc.)
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app/ ./app/
COPY --from=web-builder /web/dist ./app/static
EXPOSE 3001
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "3001"]
```

**Cost:** image grows ~50–80MB, build time grows by ~20–40s. Acceptable for a workshop image.

### Cutover

Single PR. Replaces contents of `chat-ui/app/static/`. Deletes the old vanilla `app.js`, `style.css`, `index.html`, `tool_verify.js` in the same commit (history preserves them). Before deletion, the uncommitted M9-style WIP in those files is diffed and any still-wanted behavior is incorporated into the new components. No feature flag, no `/v2` route, no parallel shipping.

## Testing

| Layer | Tool | Coverage |
| --- | --- | --- |
| Component logic | Vitest + React Testing Library | message rendering, tool-call expand/collapse, density application, ⌘K filter, corner menu |
| E2E | existing Cypress at `chat-ui/cypress/` | corner menu open/close, density preset cycle, ⌘K open + run, server probe flow, compare run, send/stop |
| Backend | existing pytest at `chat-ui/tests/` | unchanged |
| Type safety | TypeScript strict + zod at API boundary | wire shapes checked at runtime |
| Accessibility | `@axe-core/react` in dev | keyboard reachability, focus rings, AA contrast in both themes |

Visual regression intentionally not in v1 (manual review of the small matrix: 2 themes × 3 densities × 4 inspector tabs).

## Risks & Decisions Logged

- **Docker image size + build time:** +50–80MB, +20–40s. Documented; accepted as a workshop tradeoff for the design uplift.
- **Large tool-call payloads:** truncated at ~2KB visually; full payload always copyable. Avoids accidentally rendering a 10MB image manifest in the chat scroll.
- **Provider key in localStorage:** matches today's behavior; not raised as a regression. Documented behavior: never sent to any server other than the configured provider's.
- **API contract lock:** every `/api/*` response shape is captured as a zod schema in `web/src/lib/schemas.ts`. If the backend changes shape, runtime validation fails loudly; backend team has a single file to grep for "what the frontend depends on."
- **Uncommitted M9 WIP** in current static files: diffed before deletion, merged into the new components or explicitly logged as "dropped on purpose."
- **No SSE in v1:** explicitly deferred. Spec includes the upgrade path so the next iteration knows where to land it.

## Acceptance Criteria

A workshop attendee can, after `docker compose up`:

1. Load `http://localhost:3001` and see the two-pane UI in dark mode at Comfortable density.
2. Pick a provider in the input-row chip popover, set a model and (if needed) API key.
3. Send "list all users" and watch a `<ToolCallSummary>` render inline (`tool · list_users · ✓ Xms`), click it to see args and result, then read the assistant reply.
4. Glance at the Servers tab and see all expected services with green dots; click "verify" on one and see the curl result inline.
5. Open the Tools tab and read the JSON schema for any of the 20 tools.
6. Open the Trace tab and see every tool call from the session with timestamps.
7. Open the corner ⋯ menu and switch to Large density; the entire UI scales without layout shift; persists across reload.
8. Toggle to Light theme and confirm the design language holds (same shapes, flipped tokens).
9. Press `⌘K` and search "promote" → see `promote_image` in Tools group → select → drawer opens.
10. Press `⌘K` and search "compare" → focus inspector → run two providers in parallel.
11. Toggle Flying Blind from the corner menu and see the high-contrast warning band; turn it off and the band disappears.
12. Existing pytest backend tests continue to pass; existing Cypress suite passes after selector updates.

If all twelve hold, v1 is shippable.
