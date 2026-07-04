# Learn Mode Overlay + Module 8 (Build Your Own MCP Tool)

This is a living execution plan following CLAUDE.md guidelines. All sections
marked (Living) must be kept up to date as work proceeds.

Design spec: `docs/superpowers/specs/2026-07-03-learn-mode-design.md`

## Purpose / Big Picture

Turn the lab's chat UI into a KodeKloud-style guided learning platform behind a
single on/off toggle: course navigation left, lesson steps center, the agent
chat docked right — with per-module progress tracking and in-app Verify buttons
that run the real `labctl check` logic. Add Module 8 so learners don't just
consume MCP tools, they author one and watch the LLM discover and call it.
Classic mode stays untouched; the overlay can always be switched off.

## Progress (Living)

- [x] (2026-07-03) Recon: chat-ui stack (React 19/Vite/Tailwind/shadcn, token
      theming), backend endpoints, labctl checks, workshop lesson pattern
- [x] (2026-07-03) Design spec written and approved
- [x] (2026-07-03) M1: Flying Blind copy "will → may" (banner + empty-chat starter)
- [x] (2026-07-03) M1: Architecture dialog auto-opens on first visit
- [x] (2026-07-03) M2: Learn Mode store flag + header toggle + ⌘L shortcut
- [x] (2026-07-03) M2: Learn theme tokens (`data-mode="learn"`) in globals.css
- [x] (2026-07-03) M2: LearnShell layout (rail / lesson / chat) + curriculum.ts
      content for modules 1–8
- [x] (2026-07-03) M3: `custom_tools.py` skeleton + wiring into mcp-user server
- [x] (2026-07-03) M3: CURRICULUM.md Module 8 section (raw JSON-RPC → author →
      agent → verify)
- [x] (2026-07-03) M3: `labctl check 8` (stock-manifest diff on mcp-user tools)
- [x] (2026-07-03) M4: progress persistence API + curriculum check API
      (vendored labctl_pkg)
- [x] (2026-07-03) M4: Verify buttons wired in LessonPane
- [x] (2026-07-03) M5: containers built and lab run end-to-end (podman compose
      build + up; browser-verified Learn Mode, Verify PASS, persistence)
- [x] (2026-07-03) M5: docs updated (README, TODO) + tests green (65 labctl
      pytest, 64 web vitest)

## Surprises & Discoveries (Living)

- `labctl_pkg` is stdlib-only by design — it can be vendored into the chat-ui
  image and reused verbatim for the in-app Verify buttons. Single source of
  truth for module checks.
- The chat-ui backend already shells out to the container engine for
  `/api/mcp-control`, so module 6's `engine ps` check works in-container
  (confirmed live — returns the correct "no mcp-lab-app-* running" FAIL).
- FastMCP (stateless streamable-http) serves `/mcp` and 307-redirects
  `/mcp/`; urllib refuses to re-POST through a redirect, so the raw curls in
  Module 8 and `check_byo` use the no-slash path.
- Module 6's health probe (`localhost:908x`) is unreachable from inside the
  chat-ui container — added `LABCTL_APP_HEALTH_URL_TPL` so in-network callers
  probe `http://mcp-lab-app-{env}:8080` instead.
- `ArchitectureDiagram.tsx` already exists (header dialog) — the "startup
  diagram" TODO item is a first-visit auto-open, not new artwork.

## Decision Log (Living)

- Learn Mode = overlay toggle, not redesign → user explicitly wants on/off and
  the current UI preserved. (2026-07-03)
- Reuse labctl checks server-side via vendoring instead of reimplementing in
  the chat-ui backend → no drift between `labctl check` and the UI. (2026-07-03)
- Module 8 check passes when mcp-user's tools/list contains any tool beyond the
  stock manifest → lets learners name their tool anything; the lesson suggests
  `pipeline_health`. (2026-07-03)
- Learn theme via `data-mode="learn"` token overrides, not a Tailwind fork →
  shadcn primitives inherit automatically; classic tokens untouched. (2026-07-03)
- In-app lesson content is distilled from CURRICULUM.md with commands copied
  verbatim → CURRICULUM.md stays canonical long-form text. (2026-07-03)

## Outcomes & Retrospective (Living)

Shipped 2026-07-03, verified in running containers (Podman on this machine —
the lab's engine-agnostic promise held; only note: FastMCP serves `/mcp` and
307-redirects `/mcp/`, which urllib won't re-POST through, so every raw curl
and the check use the no-slash path). Live verification: Learn Mode toggle
on/off with classic mode intact, all 8 modules render, Verify module 1
returned PASS with the identical detail string as `./labctl check 1`,
progress survived both a page reload and `compose restart chat-ui`, and the
full Module 8 arc was exercised for real — check 8 FAIL (9 stock tools) →
uncommented `pipeline_health` → rebuilt mcp-user → PASS from both the CLI and
the API, with a raw `tools/call` returning live registry data → reverted to
the stock skeleton → FAIL again. Test suites: 65 labctl pytest + 64 web
vitest, all green (one cold-start flake on the first containerized vitest
run; clean on rerun). Biggest design win: vendoring the stdlib-only
labctl_pkg into the chat-ui image made "UI Verify == CLI check" true by
construction instead of by discipline.

## Context and Orientation

The lab is a docker-compose stack (15 services). The chat UI is a React 19 +
Vite + Tailwind SPA (`chat-ui/web/`) served by a FastAPI backend
(`chat-ui/app/main.py`). Styling is CSS-variable tokens in
`chat-ui/web/src/styles/globals.css` mapped to Tailwind color names in
`chat-ui/web/tailwind.config.ts`. Global client state is zustand with persist
(`chat-ui/web/src/lib/store.ts`). The existing guided tour ("workshop
wizard") lives in `chat-ui/web/src/components/workshop/` with content in
`lessons.ts` — the Learn Mode lesson data follows the same typed-data pattern.

`labctl` (`labctl-cli/labctl_pkg/`) is a stdlib-only Python CLI; its module
verifications live in `labctl_pkg/checks.py` (`MODULES` table of check
functions taking a `ctx`). The seven-module curriculum text is
`docs/CURRICULUM.md`. MCP servers are FastMCP Python apps under
`mcp-server/mcp_server/` (one `server_*.py` per domain; mcp-user is
`server_user.py` on port 8003).

"Learn Mode" = the new toggleable course shell. "Classic" = today's UI.

## Plan of Work

1. Quick wins: edit `FlyingBlindBanner.tsx` + `lib/help.ts` copy; add
   first-visit auto-open of the Architecture dialog in `Header.tsx`.
2. Learn Mode: add `learnMode` to the store; `data-mode` token set in
   `globals.css`; new `features/learn/` (LearnShell, CourseRail, LessonPane,
   curriculum.ts, useProgress.ts); branch in `App.tsx`; header toggle + ⌘L.
3. Module 8: `mcp-server/mcp_server/custom_tools.py` skeleton imported by
   `server_user.py`; Module 8 section in `docs/CURRICULUM.md`; `check_byo`
   in `labctl_pkg/checks.py` + stock-manifest constant.
4. Backend: vendor `labctl_pkg` into the chat-ui image (Dockerfile COPY);
   `/api/curriculum/progress` (GET/POST, volume JSON) and
   `/api/curriculum/check/{module}` in `chat-ui/app/main.py` with an
   internal-URL ctx adapter.
5. Verification: `docker compose build` the changed images, `up` the lab,
   browser-check Learn Mode, run checks, run test suites, update docs.

## Concrete Steps

From the repo root:

    $ docker compose build chat-ui mcp-user
    $ ./scripts/2-setup.sh --tier=full        # or: make full (if not already up)
    $ ./labctl status                          # every service healthy
    $ ./labctl check 8                         # FAIL until a custom tool exists

Open http://localhost:3001 → click the Learn toggle in the header (or ⌘L).
Expect: indigo Learn theme, course rail with 8 modules, lesson cards with copy
buttons, chat docked right. Click Verify on module 1 → PASS badge with the
same detail string `./labctl check 1` prints.

## Validation and Acceptance

- Classic mode unchanged when toggle off (visual + existing vitest suite).
- Learn Mode renders all 8 modules; commands match CURRICULUM.md verbatim.
- Verify button for module N returns the same pass/detail as `labctl check N`.
- Progress survives browser reload and `docker compose restart chat-ui`.
- `./labctl check 8` flips FAIL → PASS after authoring a tool in
  `custom_tools.py` and rebuilding mcp-user.
- Flying Blind banner says "may"; Architecture dialog auto-opens once.
- `cd chat-ui/web && npx vitest run` green; backend + labctl pytest green.

## Idempotence and Recovery

All file edits are idempotent (Write/Edit to fixed paths). Compose builds are
repeatable. `docker compose build chat-ui && docker compose up -d chat-ui`
recovers the UI after any backend change; `3-teardown.sh` + `2-setup.sh` is the
full reset. Progress data lives in the `chat-ui-data` volume; deleting the
volume resets progress only.

## Interfaces and Dependencies

- Store: `learnMode: boolean`, `setLearnMode(v)`, `learnModule: number`,
  `setLearnModule(n)` (persisted).
- Curriculum data: `type LearnStep = { id, title, body, commands?, expected?,
  agentPrompt? }`, `type LearnModule = { num, slug, title, tagline, steps,
  checkable }` in `features/learn/curriculum.ts`.
- Backend: `GET /api/curriculum/progress → {done: {"<module>.<step>": true}}`,
  `POST /api/curriculum/progress` (same shape),
  `POST /api/curriculum/check/{module} → {passed, detail, hint}`.
- `labctl_pkg.checks.MODULES` gains `(8, "byo", …, check_byo)`.
- No new npm or pip dependencies.
