# Workshop Wizard Design

Date: 2026-05-01
Status: Approved (brainstorming session)

## Goal

Consolidate the lab's startup scripts into one outcome-driven workshop entry that
walks attendees through the MCP value proposition in a deliberate, click-by-click
arc:

1. Cold-open hallucination with all MCP servers off.
2. A repeated three-step loop per MCP — hallucinate → enable via CLI → verify
   against the underlying endpoint.
3. Wrap-up.

Attendees finish the lab having (a) felt the unverified-LLM problem, (b) typed
the `compose up -d` command for each MCP themselves, and (c) learned to
double-check tool output against the underlying API rather than trusting the
model.

Outcome over time. Pacing is presenter-controlled; the wizard never
auto-advances.

## Architecture

### Terminal — `scripts/7-workshop.sh` (rewritten conductor)

1. Run `0-preflight.sh` (skipped on `--skip-preflight`). Hard-fail aborts.
2. Run `8-reset.sh` if `--reset` is passed.
3. Run `1-setup.sh` if Chat UI is not already healthy on `:3001`.
4. **Stop all MCP servers** (`compose stop mcp-user mcp-gitea mcp-registry
   mcp-promotion mcp-runner`) so the lesson begins with the cold-open
   hallucination state. This reverses today's behavior, which starts them all.
5. Open browser to `http://localhost:3001/?workshop=1`.
6. Open the MCP-logs Terminal window (existing behavior).

Numbered scripts 0/1/2/3/4/5/6/8 stay as-is for direct use. The conductor calls
0/1/8 internally; 2/3/4/5/6 remain standalone utilities. No script
consolidation beyond rewriting 7.

### Browser — `chat-ui/web/src/components/workshop/`

A right-rail dock activated only by `?workshop=1`. Renders a single phase card
at a time. State persists in `localStorage` keyed `mcp-lab.workshop.step.v1` so
refresh and lab restarts resume.

```
chat-ui/web/src/components/workshop/
  Workshop.tsx          // dock + step state owner
  IntroCard.tsx
  HallucinateCard.tsx
  EnableCard.tsx
  VerifyCard.tsx
  lessons.ts            // per-MCP config
  cmdk.ts               // workshop palette commands
```

No new backend endpoints. Reuses existing surface:

- `/api/mcp-control` — used only by the hidden ⌘K easy-mode commands.
- `/api/mcp-status` — already polled adaptively (3s offline, 30s online);
  drives Enable-card auto-detection.
- `/api/probe` — VerifyCard runs the curl-equivalent against the underlying API.
- `/api/chat` — pre-filled prompts go through the existing chat path.
- `/api/providers` — wizard reads `engine` (docker / podman) to render the
  correct CLI command.

`Walkthrough.tsx` stays untouched as the first-time intro. Workshop is a
separate surface keyed on `?workshop=1`.

## Phase model

Linear, resumable. Each row is one card.

| # | Phase | What the wizard shows |
|---|-------|------------------------|
| 0 | Welcome | Goal sentence + "All 5 MCP servers are stopped." |
| 1 | Cold-open hallucination | Pre-filled "List all users in the system." Send → unverified answer; the wizard highlights the badge. |
| 2a–c | mcp-user | Hallucinate → Enable → Verify against `http://localhost:8001/users`. |
| 3a–c | mcp-gitea | "List all repositories in Gitea." Probe `localhost:3000/api/v1/repos/search` (HTTP Basic). |
| 4a–c | mcp-registry | "What images are in the dev registry?" Probe `localhost:5001/v2/_catalog`. |
| 5a–c | mcp-promotion | "Show me the promotion policy." Probe the read-side promotion-service endpoint (verify exact path against `localhost:8002/docs` during impl; working assumption is `/policies`). |
| 6 | Capstone | One-line prompt that chains build → scan → promote → deploy; wizard enables `mcp-runner` here as part of the Enable step. Dismissible via a "Skip capstone" button. |
| 7 | Wrap-up | Recap: "the model is only as honest as the tools you give it." |

## Per-MCP loop — deliberate, no bundling

Three explicit user actions per MCP, never combined:

1. **Hallucinate** — prompt is pre-filled in the chat input but **not sent**.
   User clicks Send themselves. The "unverified" badge is the lesson.
2. **Enable** — CLI command shown as the primary action, copyable. Wizard polls
   `/api/mcp-status`; when the server flips online, the card shows ✓ and the
   "Next" button glows. No auto-advance.
3. **Verify** — same prompt pre-filled again, **not sent**. User clicks Send.
   Side-by-side panel shows the chat answer ⇄ live curl output (via
   `/api/probe`) so they can see the LLM is now grounded in real data.

Per-MCP config is a single entry, not three components:

```ts
const MCP_LESSONS = [
  { mcp: 'mcp-user', prompt: 'List all users in the system.',
    probe: { url: 'http://localhost:8001/users' },
    teach: 'The user API is unauthenticated and public.' },
  { mcp: 'mcp-gitea', prompt: 'List all repositories in Gitea.',
    probe: { url: 'http://localhost:3000/api/v1/repos/search', auth: 'basic' },
    teach: 'Gitea wants HTTP Basic — the MCP server holds the credentials.' },
  // ...
]
```

Adding a new MCP later is one entry, not three new components.

## Enable-card UX

```
┌─ Enable mcp-user ─────────────────────────────────┐
│ Run this in your terminal:                        │
│   $ docker compose up -d mcp-user      [Copy]     │
│                                                   │
│ Waiting for mcp-user to come online... ⏳         │
└───────────────────────────────────────────────────┘
```

CLI is the only on-screen path. The engine label (`docker` / `podman`) is read
from `/api/providers`. Easy mode is hidden behind ⌘K.

## ⌘K commands (registered only when `?workshop=1`)

| Command | Effect |
|---------|--------|
| `Workshop: Catch me up to current step` | Calls `/api/mcp-control` to enable every MCP that should be on by the persisted step. Pre-fills the current prompt. **Does not click Send.** State-only catch-up. |
| `Workshop: Jump to step…` | Same as catch-up but to an arbitrary step (presenter use). |
| `Workshop: Enable all remaining MCPs` | Pure cheat (presenter rescue). |
| `Workshop: Reset progress` | Clears localStorage step. Doesn't touch the lab. |

Catch-up is about **lab state**, not skipping clicks. A learner who joins late
or gets out of sync hits ⌘K → Catch me up → their UI now matches the room →
they hallucinate-or-verify like everyone else.

## Error handling

- **Refresh**: state in localStorage, lab state in `/api/mcp-status`. On reload,
  read both. If they disagree (learner manually `compose stop`'d an MCP),
  wizard shows a yellow strip: *"mcp-gitea is offline — re-run the enable
  command or hit ⌘K."* No silent auto-fix.
- **Lab not up** (`/api/mcp-status` 5xx): one card — *"The lab isn't running.
  Run `./scripts/7-workshop.sh`."* No further steps render.
- **Probe fails in Verify**: card shows the curl, the failing response, and
  links to the troubleshooting README. Step does not advance. The failed probe
  is data, not an error to swallow.
- **Wrong engine pasted**: no auto-detection. Wait-for-online times out at 60s
  with *"Still nothing — make sure you ran the command above."*

## Testing

- **pytest** (chat-ui backend): existing tests cover (no new endpoints). Add
  one test confirming `?workshop=1` doesn't break the existing `?dashboard=open`
  query param.
- **Cypress** (`chat-ui/cypress/e2e/workshop.cy.ts`): walk the wizard with
  mocked `/api/mcp-status` — start all offline, flip mcp-user online mid-spec,
  assert the Enable card transitions to ✓.
- **Conductor**: extend `7-workshop.sh --dry-run` assertions to check that
  preflight is invoked first and that `compose stop` is called for all MCPs
  before the browser opens.

## Out of scope

- New backend endpoints.
- Touching `Walkthrough.tsx`.
- Changing the numbered scripts other than `7-workshop.sh`.
- A workshop-progress server-side state (intentionally client-only).
- Renumbering / removing the existing numbered scripts.
