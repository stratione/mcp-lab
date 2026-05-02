# Workshop Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an in-UI workshop wizard at `?workshop=1` that walks attendees through a deliberate, click-by-click MCP lesson (cold-open hallucination → per-MCP enable-via-CLI → endpoint verify), and rewrite `scripts/7-workshop.sh` to be the conductor that lands them there with all MCPs stopped.

**Architecture:** Right-rail dock component owning a linear, localStorage-persisted phase state. Pre-fills the chat input but never auto-sends. Reuses existing `/api/mcp-control`, `/api/mcp-status`, `/api/probe`, `/api/chat`. Easy-mode escape registered only inside the existing `CmdK` palette. Conductor script chains `0-preflight.sh` → `8-reset.sh` (opt) → `1-setup.sh` (if needed) → `compose stop` all MCPs → open browser.

**Tech Stack:** React + Zustand + TanStack Query + Tailwind (chat-ui frontend); Vitest (unit tests); Cypress (e2e); Bash (conductor).

**Reference spec:** `docs/superpowers/specs/2026-05-01-workshop-wizard-design.md`

---

## File Structure

```
scripts/7-workshop.sh                                 [REWRITE]
chat-ui/web/src/App.tsx                               [MODIFY :15-22]
chat-ui/web/src/lib/store.ts                          [MODIFY: +fields]
chat-ui/web/src/lib/store.test.ts                     [MODIFY: +tests]
chat-ui/web/src/lib/api.ts                            [MODIFY: +probeUrl, +mcpControl]
chat-ui/web/src/lib/api.test.ts                       [MODIFY: +tests]
chat-ui/web/src/lib/schemas.ts                        [MODIFY: +ProbeResultSchema]
chat-ui/web/src/components/InputRow.tsx               [MODIFY: read pendingPrompt]
chat-ui/web/src/components/CmdK.tsx                   [MODIFY: +workshop items]
chat-ui/web/src/components/workshop/Workshop.tsx     [CREATE]
chat-ui/web/src/components/workshop/IntroCard.tsx    [CREATE]
chat-ui/web/src/components/workshop/HallucinateCard.tsx [CREATE]
chat-ui/web/src/components/workshop/EnableCard.tsx   [CREATE]
chat-ui/web/src/components/workshop/VerifyCard.tsx   [CREATE]
chat-ui/web/src/components/workshop/lessons.ts       [CREATE]
chat-ui/web/src/components/workshop/lessons.test.ts  [CREATE]
chat-ui/cypress/e2e/workshop.cy.ts                    [CREATE]
```

Each component file stays under ~80 lines. `Workshop.tsx` is the only stateful one; the four `*Card.tsx` files are pure presentation.

---

## Task 1: Store extensions (workshop mode, step, pending prompt)

**Files:**
- Modify: `chat-ui/web/src/lib/store.ts`
- Test: `chat-ui/web/src/lib/store.test.ts`

The wizard owns three new pieces of state:
- `workshopMode: boolean` — set true on mount when `?workshop=1`. Gates rendering and CmdK items.
- `workshopStep: number` — index into a phase list. Persisted to `localStorage` by Workshop.tsx (Task 5), not the store itself.
- `pendingPrompt: string | null` — wizard sets it; `InputRow` consumes and clears.

- [ ] **Step 1: Add failing tests**

Append to `chat-ui/web/src/lib/store.test.ts`:

```ts
  it('toggles workshop mode', () => {
    expect(useLab.getState().workshopMode).toBe(false)
    useLab.getState().setWorkshopMode(true)
    expect(useLab.getState().workshopMode).toBe(true)
  })

  it('tracks workshop step', () => {
    useLab.getState().setWorkshopStep(3)
    expect(useLab.getState().workshopStep).toBe(3)
  })

  it('sets and clears pendingPrompt', () => {
    useLab.getState().setPendingPrompt('List all users.')
    expect(useLab.getState().pendingPrompt).toBe('List all users.')
    useLab.getState().setPendingPrompt(null)
    expect(useLab.getState().pendingPrompt).toBeNull()
  })
```

- [ ] **Step 2: Run tests — confirm they fail**

```
cd chat-ui/web && npx vitest run src/lib/store.test.ts
```

Expected: 3 tests fail (`setWorkshopMode is not a function` etc).

- [ ] **Step 3: Add fields to store**

In `chat-ui/web/src/lib/store.ts`, extend `LabState`:

```ts
  workshopMode: boolean
  setWorkshopMode: (v: boolean) => void

  workshopStep: number
  setWorkshopStep: (n: number) => void

  pendingPrompt: string | null
  setPendingPrompt: (s: string | null) => void
```

And in the `create` body (alongside the other fields):

```ts
  workshopMode: false,
  setWorkshopMode: (workshopMode) => set({ workshopMode }),

  workshopStep: 0,
  setWorkshopStep: (workshopStep) => set({ workshopStep }),

  pendingPrompt: null,
  setPendingPrompt: (pendingPrompt) => set({ pendingPrompt }),
```

- [ ] **Step 4: Run tests — confirm pass**

```
cd chat-ui/web && npx vitest run src/lib/store.test.ts
```

Expected: all tests in the file pass.

- [ ] **Step 5: Commit**

```
git add chat-ui/web/src/lib/store.ts chat-ui/web/src/lib/store.test.ts
git -c commit.gpgsign=false commit -m "chat-ui: store gains workshopMode, workshopStep, pendingPrompt"
```

---

## Task 2: API helpers — `probeUrl` and `mcpControl`

**Files:**
- Modify: `chat-ui/web/src/lib/api.ts`
- Modify: `chat-ui/web/src/lib/schemas.ts`
- Test: `chat-ui/web/src/lib/api.test.ts`

The existing `probeServer(name)` is a leftover that doesn't match the backend (`/api/probe` takes `{url}`, returns `{status, body}`). The wizard needs both:
- `probeUrl(url)` — direct URL probe used by VerifyCard.
- `mcpControl(service, action)` — used by ⌘K easy-mode commands.

- [ ] **Step 1: Add ProbeResultSchema to `schemas.ts`**

After the existing `VerifyResponseSchema` block in `chat-ui/web/src/lib/schemas.ts`:

```ts
export const ProbeResultSchema = z.object({
  status: z.number(),
  body: z.unknown(),
})
export type ProbeResult = z.infer<typeof ProbeResultSchema>
```

- [ ] **Step 2: Add failing API tests**

Append to `chat-ui/web/src/lib/api.test.ts`:

```ts
  it('POSTs /api/probe with {url} and returns ProbeResult', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ status: 200, body: [{ id: 1 }] }), { status: 200 })
    )
    vi.stubGlobal('fetch', fetchMock)
    const r = await probeUrl('http://localhost:8001/users')
    expect(fetchMock).toHaveBeenCalledOnce()
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(JSON.parse(init.body as string)).toEqual({ url: 'http://localhost:8001/users' })
    expect(r.status).toBe(200)
  })

  it('POSTs /api/mcp-control with service+action', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, service: 'mcp-user', action: 'start' }), { status: 200 })
    )
    vi.stubGlobal('fetch', fetchMock)
    await mcpControl('mcp-user', 'start')
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(JSON.parse(init.body as string)).toEqual({ service: 'mcp-user', action: 'start' })
  })
```

Add to imports at the top of the file:

```ts
import { probeUrl, mcpControl } from './api'
```

- [ ] **Step 3: Run tests — confirm they fail**

```
cd chat-ui/web && npx vitest run src/lib/api.test.ts
```

Expected: import error or `probeUrl is not a function`.

- [ ] **Step 4: Implement helpers in `api.ts`**

Add to `chat-ui/web/src/lib/api.ts` near the existing `probeServer` (which we leave alone — it's used elsewhere):

```ts
import { ProbeResultSchema } from './schemas'

export const probeUrl = (url: string) =>
  call('/api/probe', ProbeResultSchema, json({ url }))

export const mcpControl = (service: string, action: 'start' | 'stop') =>
  call('/api/mcp-control', z.unknown(), json({ service, action }))
```

- [ ] **Step 5: Run tests — confirm pass and commit**

```
cd chat-ui/web && npx vitest run src/lib/api.test.ts
```

Expected: all tests pass.

```
git add chat-ui/web/src/lib/api.ts chat-ui/web/src/lib/api.test.ts chat-ui/web/src/lib/schemas.ts
git -c commit.gpgsign=false commit -m "chat-ui: add probeUrl and mcpControl API helpers"
```

---

## Task 3: InputRow reads `pendingPrompt`

**Files:**
- Modify: `chat-ui/web/src/components/InputRow.tsx`

The wizard pre-fills via `setPendingPrompt('...')`. InputRow must copy that value into its local `value` state and clear `pendingPrompt`. It must NOT auto-send (deliberate-by-design rule).

- [ ] **Step 1: Read current InputRow**

Already at `chat-ui/web/src/components/InputRow.tsx`. Local state lives in `useState('')`.

- [ ] **Step 2: Add useEffect that consumes pendingPrompt**

Modify the top of the component, just after the `abort` line:

```tsx
  const pending = useLab((s) => s.pendingPrompt)
  const setPending = useLab((s) => s.setPendingPrompt)

  // Workshop wizard pre-fills the input. Copy it in, clear the store flag.
  // We never auto-submit — the audience must click Send.
  useEffect(() => {
    if (pending !== null) {
      setValue(pending)
      setPending(null)
      queueMicrotask(autoGrow)
      ta.current?.focus()
    }
  }, [pending, setPending])
```

Add `useEffect` to the React import at the top:

```tsx
import { useEffect, useRef, useState } from 'react'
```

- [ ] **Step 3: Build to confirm no TypeScript regressions**

```
cd chat-ui/web && npm run build 2>&1 | tail -5
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```
git add chat-ui/web/src/components/InputRow.tsx
git -c commit.gpgsign=false commit -m "chat-ui: InputRow consumes pendingPrompt without auto-sending"
```

---

## Task 4: Lessons config

**Files:**
- Create: `chat-ui/web/src/components/workshop/lessons.ts`
- Create: `chat-ui/web/src/components/workshop/lessons.test.ts`

A single source of truth that drives the per-MCP loop. Adding an MCP later is one entry, not three new components.

- [ ] **Step 1: Write failing test**

Create `chat-ui/web/src/components/workshop/lessons.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { LESSONS, PHASE_COUNT } from './lessons'

describe('LESSONS config', () => {
  it('lists the four read-side MCPs in workshop order', () => {
    expect(LESSONS.map((l) => l.mcp)).toEqual([
      'mcp-user',
      'mcp-gitea',
      'mcp-registry',
      'mcp-promotion',
    ])
  })

  it('every lesson has a prompt, probe URL, and one-line teach', () => {
    for (const l of LESSONS) {
      expect(l.prompt.length).toBeGreaterThan(10)
      expect(l.probe.url).toMatch(/^http:\/\/localhost:\d+/)
      expect(l.teach.length).toBeGreaterThan(10)
    }
  })

  it('PHASE_COUNT counts intro + cold-open + 3 cards per MCP + capstone + wrap', () => {
    // 1 (welcome) + 1 (cold-open) + 4*3 (per-MCP) + 1 (capstone) + 1 (wrap) = 16
    expect(PHASE_COUNT).toBe(16)
  })
})
```

- [ ] **Step 2: Run test — confirm fail**

```
cd chat-ui/web && npx vitest run src/components/workshop/lessons.test.ts
```

Expected: import resolution error.

- [ ] **Step 3: Create `lessons.ts`**

```ts
export type Lesson = {
  mcp: 'mcp-user' | 'mcp-gitea' | 'mcp-registry' | 'mcp-promotion'
  prompt: string
  probe: { url: string; auth?: 'basic' }
  teach: string
}

export const LESSONS: Lesson[] = [
  {
    mcp: 'mcp-user',
    prompt: 'List all users in the system.',
    probe: { url: 'http://localhost:8001/users' },
    teach: 'The user API is unauthenticated and public — the MCP just calls it.',
  },
  {
    mcp: 'mcp-gitea',
    prompt: 'List all repositories in Gitea.',
    probe: { url: 'http://localhost:3000/api/v1/repos/search', auth: 'basic' },
    teach: 'Gitea wants HTTP Basic — the MCP server holds the credentials so the model never sees them.',
  },
  {
    mcp: 'mcp-registry',
    prompt: 'What images are in the dev registry?',
    probe: { url: 'http://localhost:5001/v2/_catalog' },
    teach: 'Registry v2 returns JSON; the MCP unwraps the catalog into a clean list.',
  },
  {
    mcp: 'mcp-promotion',
    prompt: 'Show me the promotion policy.',
    probe: { url: 'http://localhost:8002/policies' },
    teach: 'The promotion service exposes a policy doc; without the MCP, the model would invent one.',
  },
]

// 1 welcome + 1 cold-open + 3 cards * 4 MCPs + 1 capstone + 1 wrap
export const PHASE_COUNT = 1 + 1 + 3 * LESSONS.length + 1 + 1
```

- [ ] **Step 4: Run test — confirm pass**

```
cd chat-ui/web && npx vitest run src/components/workshop/lessons.test.ts
```

Expected: 3 tests pass.

> If the `localhost:8002/policies` endpoint doesn't exist, change the probe URL after running `curl http://localhost:8002/openapi.json | jq '.paths | keys'` to find the actual read-side path. Update the test's expectation only if you change the prompt or probe URL.

- [ ] **Step 5: Commit**

```
git add chat-ui/web/src/components/workshop/
git -c commit.gpgsign=false commit -m "chat-ui: workshop lessons config (4 read-side MCPs)"
```

---

## Task 5: Workshop dock skeleton + URL detection

**Files:**
- Create: `chat-ui/web/src/components/workshop/Workshop.tsx`
- Modify: `chat-ui/web/src/App.tsx`

`Workshop.tsx` reads `?workshop=1` once on mount, sets `workshopMode`, restores `workshopStep` from localStorage, and renders a fixed dock at the bottom of the viewport. For now it just prints "Step N of M" — the cards come in the next tasks.

- [ ] **Step 1: Create the skeleton dock**

`chat-ui/web/src/components/workshop/Workshop.tsx`:

```tsx
import { useEffect } from 'react'
import { useLab } from '@/lib/store'
import { PHASE_COUNT } from './lessons'

const STEP_KEY = 'mcp-lab.workshop.step.v1'

export function Workshop() {
  const mode = useLab((s) => s.workshopMode)
  const setMode = useLab((s) => s.setWorkshopMode)
  const step = useLab((s) => s.workshopStep)
  const setStep = useLab((s) => s.setWorkshopStep)

  // One-time mount: detect ?workshop=1 and restore persisted step.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('workshop') === '1') {
      setMode(true)
      const saved = parseInt(localStorage.getItem(STEP_KEY) ?? '0', 10)
      setStep(Number.isFinite(saved) ? saved : 0)
    }
  }, [setMode, setStep])

  // Persist step changes.
  useEffect(() => {
    if (mode) localStorage.setItem(STEP_KEY, String(step))
  }, [mode, step])

  if (!mode) return null

  return (
    <div
      data-testid="workshop-dock"
      className="fixed bottom-20 right-4 w-96 z-30 bg-surface border border-border rounded-lg shadow-lg p-4 text-sm"
    >
      <div className="text-xs text-muted mb-2">
        Workshop · step {step + 1} of {PHASE_COUNT}
      </div>
      <div className="text-faint italic">(card slot — wired in later tasks)</div>
    </div>
  )
}
```

- [ ] **Step 2: Render Workshop in App.tsx**

In `chat-ui/web/src/App.tsx`, add the import and place `<Workshop />` before `<Walkthrough />`:

```tsx
import { Workshop } from '@/components/workshop/Workshop'
```

```tsx
      <CmdK />
      <Shortcuts />
      <Workshop />
      <Walkthrough />
```

- [ ] **Step 3: Smoke-build**

```
cd chat-ui/web && npm run build 2>&1 | tail -5
```

Expected: build succeeds.

- [ ] **Step 4: Manual smoke-check**

```
cd chat-ui/web && npm run dev
```

Open `http://localhost:5173/?workshop=1` (Vite dev port — adapt if different). Expect the dock to render with "Step 1 of 16". Open without the param: dock should not render.

- [ ] **Step 5: Commit**

```
git add chat-ui/web/src/components/workshop/Workshop.tsx chat-ui/web/src/App.tsx
git -c commit.gpgsign=false commit -m "chat-ui: workshop dock skeleton + ?workshop=1 detection"
```

---

## Task 6: IntroCard component

**Files:**
- Create: `chat-ui/web/src/components/workshop/IntroCard.tsx`

Pure presentation. Takes `onNext` callback. Renders the welcome blurb.

- [ ] **Step 1: Implement**

`chat-ui/web/src/components/workshop/IntroCard.tsx`:

```tsx
import { Button } from '@/components/ui/button'

export function IntroCard({ onNext }: { onNext: () => void }) {
  return (
    <div data-testid="workshop-intro" className="space-y-3">
      <h3 className="font-semibold">Welcome to the MCP Lab</h3>
      <p className="text-muted">
        All five MCP servers are stopped. We're going to ask the LLM questions
        about a real lab of services it can't currently reach. Then we'll bring
        each MCP up — one at a time — and watch the answers go from
        plausible-but-fake to grounded in the actual API.
      </p>
      <p className="text-muted">
        Every step takes one explicit click. Take your time.
      </p>
      <div className="flex justify-end">
        <Button size="sm" onClick={onNext}>Begin</Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Build**

```
cd chat-ui/web && npm run build 2>&1 | tail -5
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```
git add chat-ui/web/src/components/workshop/IntroCard.tsx
git -c commit.gpgsign=false commit -m "chat-ui: IntroCard"
```

---

## Task 7: HallucinateCard component

**Files:**
- Create: `chat-ui/web/src/components/workshop/HallucinateCard.tsx`

Pre-fills the chat input with the lesson's prompt; user clicks Send themselves. Card just shows what the prompt is, why it's interesting, and a "Next" button (which the presenter clicks after the audience sees the unverified badge).

- [ ] **Step 1: Implement**

`chat-ui/web/src/components/workshop/HallucinateCard.tsx`:

```tsx
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { useLab } from '@/lib/store'

type Props = {
  mcpLabel: string
  prompt: string
  onNext: () => void
  pass: 'cold-open' | 'pre-enable' | 'post-enable'
}

const HEADINGS: Record<Props['pass'], string> = {
  'cold-open': 'Step 1 — Ask before you have any tools',
  'pre-enable': 'Without the MCP — what does the model say?',
  'post-enable': 'With the MCP on — does the answer change?',
}

export function HallucinateCard({ mcpLabel, prompt, onNext, pass }: Props) {
  const setPending = useLab((s) => s.setPendingPrompt)

  // Pre-fill the chat input on mount. Never auto-send.
  useEffect(() => {
    setPending(prompt)
  }, [prompt, setPending])

  return (
    <div data-testid="workshop-hallucinate" className="space-y-3">
      <h3 className="font-semibold">{HEADINGS[pass]}</h3>
      <div className="text-xs text-muted">{mcpLabel}</div>
      <p className="text-muted">The prompt is in the chat box. Click Send when you're ready.</p>
      <div className="font-mono text-xs bg-bg border border-border rounded p-2">{prompt}</div>
      <div className="flex justify-end">
        <Button size="sm" onClick={onNext}>Next →</Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Build**

```
cd chat-ui/web && npm run build 2>&1 | tail -5
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```
git add chat-ui/web/src/components/workshop/HallucinateCard.tsx
git -c commit.gpgsign=false commit -m "chat-ui: HallucinateCard pre-fills prompt without auto-send"
```

---

## Task 8: EnableCard component

**Files:**
- Create: `chat-ui/web/src/components/workshop/EnableCard.tsx`

Renders the engine-correct CLI command (`docker compose up -d <mcp>` or `podman compose up -d <mcp>`). Polls `/api/mcp-status` via the existing `useServers` hook. When the named server flips `online`, the card transitions to ✓ and lights up "Next".

- [ ] **Step 1: Implement**

`chat-ui/web/src/components/workshop/EnableCard.tsx`:

```tsx
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useServers } from '@/features/servers/useServers'
import { useQuery } from '@tanstack/react-query'
import { getMcpStatusEnvelope } from '@/lib/api'

export function EnableCard({ mcp, onNext }: { mcp: string; onNext: () => void }) {
  const { data: servers } = useServers()
  // Engine label comes from the mcp-status envelope, not the server array.
  const { data: env } = useQuery({
    queryKey: ['mcp-status-envelope'],
    queryFn: ({ signal }) => getMcpStatusEnvelope(signal),
    refetchInterval: 30_000,
  })
  const [copied, setCopied] = useState(false)
  const engine = env?.engine ?? 'docker'
  const cmd = `${engine} compose up -d ${mcp}`
  const online = servers?.find((s) => s.name === mcp)?.status === 'online'

  async function copy() {
    await navigator.clipboard.writeText(cmd)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div data-testid="workshop-enable" className="space-y-3">
      <h3 className="font-semibold">Step 2 — Enable {mcp}</h3>
      <p className="text-muted">Run this in your terminal:</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 font-mono text-xs bg-bg border border-border rounded p-2">
          $ {cmd}
        </code>
        <Button size="sm" variant="outline" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <div className="text-xs" data-testid="workshop-enable-status">
        {online ? (
          <span className="text-ok">✓ {mcp} is online.</span>
        ) : (
          <span className="text-muted">Waiting for {mcp} to come online…</span>
        )}
      </div>
      <div className="flex justify-end">
        <Button size="sm" disabled={!online} onClick={onNext}>Next →</Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Build**

```
cd chat-ui/web && npm run build 2>&1 | tail -5
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```
git add chat-ui/web/src/components/workshop/EnableCard.tsx
git -c commit.gpgsign=false commit -m "chat-ui: EnableCard renders engine-correct CLI + polls online state"
```

---

## Task 9: VerifyCard component

**Files:**
- Create: `chat-ui/web/src/components/workshop/VerifyCard.tsx`

Pre-fills the same prompt (so the user can re-send), and runs `probeUrl(...)` once on mount. Renders the JSON response so the audience can compare the chat answer to ground truth. "Next" is enabled once the probe completes (success or 4xx/5xx — a failed probe is data, not a blocker).

- [ ] **Step 1: Implement**

`chat-ui/web/src/components/workshop/VerifyCard.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useLab } from '@/lib/store'
import { probeUrl } from '@/lib/api'
import type { ProbeResult } from '@/lib/schemas'

type Props = {
  mcp: string
  prompt: string
  probe: { url: string; auth?: 'basic' }
  teach: string
  onNext: () => void
}

export function VerifyCard({ mcp, prompt, probe, teach, onNext }: Props) {
  const setPending = useLab((s) => s.setPendingPrompt)
  const [result, setResult] = useState<ProbeResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setPending(prompt)
    let cancelled = false
    probeUrl(probe.url)
      .then((r) => { if (!cancelled) setResult(r) })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [prompt, probe.url, setPending])

  const done = result !== null || error !== null

  return (
    <div data-testid="workshop-verify" className="space-y-3">
      <h3 className="font-semibold">Step 3 — Verify against the real endpoint</h3>
      <p className="text-muted">Re-send the prompt (still in the chat box). Compare to the live API:</p>
      <div className="font-mono text-xs bg-bg border border-border rounded p-2">
        $ curl {probe.auth === 'basic' ? '-u mcpadmin:mcpadmin123 ' : ''}{probe.url}
      </div>
      <pre
        data-testid="workshop-verify-body"
        className="font-mono text-[11px] bg-bg border border-border rounded p-2 max-h-32 overflow-auto whitespace-pre-wrap"
      >
        {error
          ? `error: ${error}`
          : result
          ? JSON.stringify(result.body, null, 2).slice(0, 800)
          : 'probing…'}
      </pre>
      <p className="text-xs text-muted italic">{teach}</p>
      <div className="flex justify-end">
        <Button size="sm" disabled={!done} onClick={onNext}>Next →</Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Build**

```
cd chat-ui/web && npm run build 2>&1 | tail -5
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```
git add chat-ui/web/src/components/workshop/VerifyCard.tsx
git -c commit.gpgsign=false commit -m "chat-ui: VerifyCard pre-fills + probes endpoint in parallel"
```

---

## Task 10: Workshop phase state machine

**Files:**
- Modify: `chat-ui/web/src/components/workshop/Workshop.tsx`

Wire the four card types into a single linear phase index. Mapping:

```
step 0           → IntroCard
step 1           → HallucinateCard (cold-open, no MCP context)
step 2 + i*3     → HallucinateCard (pre-enable for LESSONS[i])
step 3 + i*3     → EnableCard (LESSONS[i])
step 4 + i*3     → VerifyCard (LESSONS[i])
step 14          → CapstoneCard (presented as a HallucinateCard with mcp-runner enable)
step 15          → WrapCard (intro-style summary)
```

Capstone and Wrap reuse `HallucinateCard` and `IntroCard` — no new components needed. Capstone sets a longer prompt, then advances to the Wrap card; mcp-runner is enabled either via the user typing the command or via ⌘K easy-mode.

- [ ] **Step 1: Replace the placeholder dock body**

In `chat-ui/web/src/components/workshop/Workshop.tsx`, replace the body of the `if (!mode) return null` block + return statement:

```tsx
import { LESSONS, PHASE_COUNT } from './lessons'
import { IntroCard } from './IntroCard'
import { HallucinateCard } from './HallucinateCard'
import { EnableCard } from './EnableCard'
import { VerifyCard } from './VerifyCard'
```

Replace the return body with:

```tsx
  if (!mode) return null

  const next = () => setStep(Math.min(step + 1, PHASE_COUNT - 1))

  let card: React.ReactNode = null
  if (step === 0) {
    card = <IntroCard onNext={next} />
  } else if (step === 1) {
    card = (
      <HallucinateCard
        pass="cold-open"
        mcpLabel="No MCP servers running"
        prompt="List all users in the system."
        onNext={next}
      />
    )
  } else if (step >= 2 && step <= 1 + 3 * LESSONS.length) {
    const offset = step - 2
    const i = Math.floor(offset / 3)
    const sub = offset % 3
    const lesson = LESSONS[i]
    if (sub === 0) {
      card = (
        <HallucinateCard
          pass="pre-enable"
          mcpLabel={lesson.mcp}
          prompt={lesson.prompt}
          onNext={next}
        />
      )
    } else if (sub === 1) {
      card = <EnableCard mcp={lesson.mcp} onNext={next} />
    } else {
      card = (
        <VerifyCard
          mcp={lesson.mcp}
          prompt={lesson.prompt}
          probe={lesson.probe}
          teach={lesson.teach}
          onNext={next}
        />
      )
    }
  } else if (step === PHASE_COUNT - 2) {
    card = (
      <HallucinateCard
        pass="pre-enable"
        mcpLabel="Capstone — chain everything"
        prompt="Build the hello-app from sample-app, scan it, promote it to production, and deploy it."
        onNext={next}
      />
    )
  } else {
    // step === PHASE_COUNT - 1 — wrap
    card = (
      <IntroCard
        onNext={() => {
          // Wrap step's "Begin" button is a no-op; presenter manually closes.
        }}
      />
    )
  }

  return (
    <div
      data-testid="workshop-dock"
      className="fixed bottom-20 right-4 w-96 z-30 bg-surface border border-border rounded-lg shadow-lg p-4 text-sm"
    >
      <div className="text-xs text-muted mb-2 flex justify-between">
        <span>Workshop · step {step + 1} of {PHASE_COUNT}</span>
        <button
          className="text-faint hover:text-muted"
          onClick={() => setStep(Math.max(step - 1, 0))}
          aria-label="Previous step"
        >
          ← back
        </button>
      </div>
      {card}
    </div>
  )
```

- [ ] **Step 2: Build**

```
cd chat-ui/web && npm run build 2>&1 | tail -5
```

Expected: build succeeds.

- [ ] **Step 3: Manual smoke-check**

Run the dev server and open `http://localhost:5173/?workshop=1`. Click Begin → cold-open card with prompt pre-filled in the chat input (don't actually send if no provider is configured). Click Next through 14 steps; each step shows the right card type for its index.

- [ ] **Step 4: Commit**

```
git add chat-ui/web/src/components/workshop/Workshop.tsx
git -c commit.gpgsign=false commit -m "chat-ui: workshop phase state machine"
```

---

## Task 11: ⌘K workshop commands

**Files:**
- Modify: `chat-ui/web/src/components/CmdK.tsx`

Hide easy-mode behind the existing palette. Visible only when `workshopMode === true`.

- [ ] **Step 1: Add workshop CommandGroup**

In `chat-ui/web/src/components/CmdK.tsx`, add to imports:

```tsx
import { LESSONS } from '@/components/workshop/lessons'
import { mcpControl } from '@/lib/api'
```

Read workshop state at the top of the component:

```tsx
  const workshopMode = useLab((s) => s.workshopMode)
  const workshopStep = useLab((s) => s.workshopStep)
  const setWorkshopStep = useLab((s) => s.setWorkshopStep)
  const setPending = useLab((s) => s.setPendingPrompt)
```

Above the `</CommandList>` closing tag, add:

```tsx
            {workshopMode ? (
              <>
                <CommandSeparator />
                <CommandGroup heading="Workshop">
                  <CommandItem
                    onSelect={go(async () => {
                      // Catch-up: enable every MCP that should be on by current step.
                      // step 2 + 3*i .. 4 + 3*i belongs to LESSONS[i]; LESSONS[i] is enabled at sub=1.
                      for (let i = 0; i < LESSONS.length; i++) {
                        const enableStep = 3 + 3 * i
                        if (workshopStep >= enableStep) {
                          await mcpControl(LESSONS[i].mcp, 'start').catch(() => {})
                        }
                      }
                    })}
                  >
                    Workshop: Catch me up to current step
                  </CommandItem>
                  <CommandItem
                    onSelect={go(async () => {
                      for (const l of LESSONS) {
                        await mcpControl(l.mcp, 'start').catch(() => {})
                      }
                      await mcpControl('mcp-runner', 'start').catch(() => {})
                    })}
                  >
                    Workshop: Enable all remaining MCPs (presenter cheat)
                  </CommandItem>
                  <CommandItem
                    onSelect={go(() => {
                      localStorage.removeItem('mcp-lab.workshop.step.v1')
                      setWorkshopStep(0)
                      setPending(null)
                    })}
                  >
                    Workshop: Reset progress
                  </CommandItem>
                </CommandGroup>
              </>
            ) : null}
```

- [ ] **Step 2: Build**

```
cd chat-ui/web && npm run build 2>&1 | tail -5
```

Expected: build succeeds.

- [ ] **Step 3: Manual smoke-check**

Open `?workshop=1`, hit ⌘K — Workshop group appears. Open without the param — group is hidden.

- [ ] **Step 4: Commit**

```
git add chat-ui/web/src/components/CmdK.tsx
git -c commit.gpgsign=false commit -m "chat-ui: ⌘K workshop commands (only when ?workshop=1)"
```

---

## Task 12: Conductor script `7-workshop.sh` rewrite

**Files:**
- Modify: `scripts/7-workshop.sh`

The current script *starts* all MCPs. It must instead *stop* them so the workshop opens on the cold-open hallucination state. Add `--skip-preflight` flag and ensure `0-preflight.sh` runs before `1-setup.sh`.

- [ ] **Step 1: Rewrite the script**

Replace the entire body of `scripts/7-workshop.sh` with:

```bash
#!/usr/bin/env bash
# MCP DevOps Lab — Workshop conductor.
#
# Single command for the presenter:
#   - run preflight checks (skippable with --skip-preflight)
#   - bring core lab up if not already healthy
#   - reset to seeded baseline if --reset is passed
#   - STOP all MCP servers (the workshop wizard opens on the cold-open state)
#   - open the Chat UI in workshop mode (?workshop=1)
#   - tail MCP logs in a side terminal
#
# Usage:
#   ./scripts/7-workshop.sh                  # full conductor flow
#   ./scripts/7-workshop.sh --reset          # call 8-reset.sh first
#   ./scripts/7-workshop.sh --skip-preflight # skip 0-preflight.sh
#   ./scripts/7-workshop.sh --dry-run        # print what would run, do nothing
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

DRY_RUN=false
DO_RESET=false
SKIP_PREFLIGHT=false
for arg in "$@"; do
  case "$arg" in
    --dry-run)        DRY_RUN=true ;;
    --reset)          DO_RESET=true ;;
    --skip-preflight) SKIP_PREFLIGHT=true ;;
    *) echo "Unknown flag: $arg"; exit 2 ;;
  esac
done

# Detect engine + compose binary the same way 1-setup.sh does.
if [ -f "$SCRIPT_DIR/_detect-engine.sh" ]; then
  source "$SCRIPT_DIR/_detect-engine.sh"
fi
COMPOSE="${COMPOSE:-docker compose}"
ENGINE="${ENGINE:-docker}"

run_or_print() {
  if $DRY_RUN; then
    echo "  [dry-run] would run: $*"
  else
    "$@"
  fi
}

echo "[1/5] Preflight checks..."
if $SKIP_PREFLIGHT; then
  echo "  Skipped (--skip-preflight)."
elif $DRY_RUN; then
  echo "  [dry-run] would run: $SCRIPT_DIR/0-preflight.sh"
else
  "$SCRIPT_DIR/0-preflight.sh"
fi

if $DO_RESET; then
  echo "[1.5/5] Resetting lab to seeded baseline..."
  if $DRY_RUN; then
    echo "  [dry-run] would run: $SCRIPT_DIR/8-reset.sh"
  else
    "$SCRIPT_DIR/8-reset.sh"
  fi
fi

echo "[2/5] Ensuring core lab is up..."
if curl -sf http://localhost:3001/health >/dev/null 2>&1; then
  echo "  Chat UI is already healthy."
else
  if $DRY_RUN; then
    echo "  [dry-run] would run: $SCRIPT_DIR/1-setup.sh"
  else
    "$SCRIPT_DIR/1-setup.sh"
  fi
fi

echo "[3/5] Stopping all MCP servers (workshop opens on cold-open state)..."
run_or_print $COMPOSE stop mcp-user mcp-gitea mcp-registry mcp-promotion mcp-runner

echo "[4/5] Opening Chat UI in workshop mode..."
WORKSHOP_URL="http://localhost:3001/?workshop=1"
if $DRY_RUN; then
  echo "  [dry-run] would open: $WORKSHOP_URL"
elif command -v open >/dev/null 2>&1; then
  open "$WORKSHOP_URL" || true
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$WORKSHOP_URL" >/dev/null 2>&1 || true
else
  echo "  Open this URL manually: $WORKSHOP_URL"
fi

echo "[5/5] Opening a Terminal window tailing MCP logs..."
if $DRY_RUN; then
  echo "  [dry-run] would launch terminal: $COMPOSE logs -f mcp-user mcp-gitea mcp-registry mcp-promotion mcp-runner"
elif [[ "$(uname -s)" == "Darwin" ]]; then
  osascript <<EOF
tell application "Terminal"
  activate
  do script "cd $PROJECT_DIR && $COMPOSE logs -f mcp-user mcp-gitea mcp-registry mcp-promotion mcp-runner"
end tell
EOF
elif command -v gnome-terminal >/dev/null 2>&1; then
  gnome-terminal -- bash -c "cd $PROJECT_DIR && $COMPOSE logs -f mcp-user mcp-gitea mcp-registry mcp-promotion mcp-runner; exec bash" &
elif command -v konsole >/dev/null 2>&1; then
  konsole -e bash -c "cd $PROJECT_DIR && $COMPOSE logs -f mcp-user mcp-gitea mcp-registry mcp-promotion mcp-runner; exec bash" &
else
  echo "  (no terminal opener found — run manually: $COMPOSE logs -f mcp-...)"
fi

echo ""
echo "================================================================"
echo "  Workshop ready. Have a great talk!"
echo "  Reset between sessions:  ./scripts/7-workshop.sh --reset"
echo "================================================================"
```

- [ ] **Step 2: Run with `--dry-run` to validate the flow prints**

```
cd /Users/noelorona/Desktop/repos/mcp-lab && ./scripts/7-workshop.sh --dry-run
```

Expected: prints 5 phases, no side effects. Should mention preflight, MCP stop, `?workshop=1` URL.

- [ ] **Step 3: Run with `--dry-run --skip-preflight`**

```
cd /Users/noelorona/Desktop/repos/mcp-lab && ./scripts/7-workshop.sh --dry-run --skip-preflight
```

Expected: phase [1/5] prints "Skipped (--skip-preflight).".

- [ ] **Step 4: Commit**

```
git add scripts/7-workshop.sh
git -c commit.gpgsign=false commit -m "scripts: 7-workshop.sh becomes the conductor (preflight, stop MCPs, open ?workshop=1)"
```

---

## Task 13: Cypress workshop spec

**Files:**
- Create: `chat-ui/cypress/e2e/workshop.cy.ts`

End-to-end test: hit `?workshop=1`, advance through cold-open + first MCP loop, mock `/api/mcp-status` to flip mcp-user online, assert the EnableCard transitions and VerifyCard renders the probe response.

- [ ] **Step 1: Inspect an existing cypress spec for project conventions**

```
cd /Users/noelorona/Desktop/repos/mcp-lab && head -40 chat-ui/cypress/e2e/redesign.cy.ts
```

Note: spec uses `cy.intercept`, `cy.visit`, etc. Match that style.

- [ ] **Step 2: Create the spec**

`chat-ui/cypress/e2e/workshop.cy.ts`:

```ts
describe('workshop wizard (?workshop=1)', () => {
  beforeEach(() => {
    // Start with all MCPs offline.
    cy.intercept('GET', '/api/mcp-status', {
      statusCode: 200,
      body: {
        servers: [
          { name: 'mcp-user', status: 'offline', port: 8003, tools: [], tool_count: 0 },
          { name: 'mcp-gitea', status: 'offline', port: 8004, tools: [], tool_count: 0 },
          { name: 'mcp-registry', status: 'offline', port: 8005, tools: [], tool_count: 0 },
          { name: 'mcp-promotion', status: 'offline', port: 8006, tools: [], tool_count: 0 },
          { name: 'mcp-runner', status: 'offline', port: 8007, tools: [], tool_count: 0 },
        ],
        total_tools: 0,
        online_count: 0,
        engine: 'podman',
      },
    }).as('mcpStatus')

    cy.intercept('POST', '/api/probe', { statusCode: 200, body: { status: 200, body: [{ id: 1, username: 'alice' }] } })
    cy.intercept('GET', '/api/tools', { statusCode: 200, body: { tools: [] } })
    cy.intercept('GET', '/api/providers', { statusCode: 200, body: { providers: [], active: { provider: 'pretend' } } })
    cy.intercept('GET', '/api/hallucination-mode', { statusCode: 200, body: { enabled: false } })
    cy.intercept('GET', '/api/chat-history', { statusCode: 200, body: { turns: [], history: [] } })
  })

  it('hides the dock when ?workshop=1 is absent', () => {
    cy.visit('/')
    cy.get('[data-testid=workshop-dock]').should('not.exist')
  })

  it('walks through intro → cold-open → mcp-user enable + verify', () => {
    cy.visit('/?workshop=1')
    cy.get('[data-testid=workshop-dock]').should('be.visible')
    cy.get('[data-testid=workshop-intro]').contains('Welcome to the MCP Lab')
    cy.contains('button', 'Begin').click()

    // Cold-open hallucinate
    cy.get('[data-testid=workshop-hallucinate]').should('exist')
    cy.get('[data-testid=chat-input]').should('have.value', 'List all users in the system.')
    cy.contains('button', 'Next →').click()

    // mcp-user pre-enable hallucinate
    cy.get('[data-testid=workshop-hallucinate]').should('exist')
    cy.contains('button', 'Next →').click()

    // mcp-user enable card — engine label is podman, Next disabled
    cy.get('[data-testid=workshop-enable]').contains('podman compose up -d mcp-user')
    cy.contains('button', 'Next →').should('be.disabled')

    // Flip mcp-user online and confirm advance is now possible.
    cy.intercept('GET', '/api/mcp-status', (req) => {
      req.reply({
        statusCode: 200,
        body: {
          servers: [
            { name: 'mcp-user', status: 'online', port: 8003, tools: ['list_users'], tool_count: 1 },
            { name: 'mcp-gitea', status: 'offline', port: 8004, tools: [], tool_count: 0 },
            { name: 'mcp-registry', status: 'offline', port: 8005, tools: [], tool_count: 0 },
            { name: 'mcp-promotion', status: 'offline', port: 8006, tools: [], tool_count: 0 },
            { name: 'mcp-runner', status: 'offline', port: 8007, tools: [], tool_count: 0 },
          ],
          total_tools: 1,
          online_count: 1,
          engine: 'podman',
        },
      })
    })
    cy.get('[data-testid=workshop-enable-status]', { timeout: 6000 }).should('contain', '✓')
    cy.contains('button', 'Next →').should('not.be.disabled').click()

    // Verify card runs probe; body renders.
    cy.get('[data-testid=workshop-verify]').should('exist')
    cy.get('[data-testid=workshop-verify-body]').should('contain', 'alice')
  })
})
```

- [ ] **Step 3: Run the spec headlessly**

```
cd /Users/noelorona/Desktop/repos/mcp-lab/chat-ui && ./node_modules/.bin/cypress run --browser chrome --headless --spec cypress/e2e/workshop.cy.ts
```

Expected: 2 tests pass. (Requires `chat-ui` running on `:3001`. Bring it up first with `./scripts/2-start-lab.sh` if not already running.)

- [ ] **Step 4: Commit**

```
git add chat-ui/cypress/e2e/workshop.cy.ts
git -c commit.gpgsign=false commit -m "chat-ui: cypress spec for workshop wizard"
```

---

## Task 14: Self-verify the full flow

**Files:** none (verification only)

End-to-end smoke test against the real lab.

- [ ] **Step 1: Run the conductor end-to-end (no flags)**

```
cd /Users/noelorona/Desktop/repos/mcp-lab && ./scripts/7-workshop.sh --reset
```

Expected: preflight passes, lab boots if not up, all MCPs stop, browser opens to `http://localhost:3001/?workshop=1`.

- [ ] **Step 2: Manually walk the wizard**

In the opened browser:

1. IntroCard renders → click Begin.
2. Cold-open HallucinateCard renders with prompt pre-filled in chat input.
3. Click Send (provider must be configured — Demo / Ollama / API key). The reply has the "unverified" badge.
4. Click Next.
5. mcp-user pre-enable HallucinateCard. Send → unverified again.
6. Next → EnableCard.
7. Copy the command, paste into a separate terminal, run it.
8. Within ~3s the EnableCard flips to ✓.
9. Click Next → VerifyCard. Click Send. Compare chat reply to the probe body.
10. Repeat for mcp-gitea, mcp-registry, mcp-promotion.
11. Capstone card renders with the chained prompt.
12. Wrap card.

- [ ] **Step 3: Verify ⌘K**

Open ⌘K — confirm "Workshop: Catch me up to current step" exists. Trigger Reset progress, see the wizard return to step 0.

- [ ] **Step 4: Resume across reload**

Reload the browser (with `?workshop=1` still in URL). Wizard should resume on the same step. Remove `?workshop=1` — wizard does not render.

- [ ] **Step 5: No commit needed (verification only)**

If issues found, file them as fixes and add them as additional tasks.

---

## Self-Review

**Spec coverage** (each spec section → task that implements it):
- Architecture / Terminal conductor → Task 12
- Architecture / Browser dock → Task 5, Task 10
- Architecture / Reused endpoints → Task 2 (probeUrl + mcpControl)
- Phase model → Task 4 (lessons), Task 10 (state machine)
- Per-MCP loop / pre-fill no-auto-send → Task 3 (InputRow), Task 7 (HallucinateCard), Task 9 (VerifyCard)
- Enable-card UX → Task 8
- ⌘K commands → Task 11
- Error handling / refresh → Task 5 (localStorage), Task 8 (offline-state visible)
- Error handling / lab-not-up → already covered by existing useServers error state; manual verification in Task 14
- Error handling / probe fails → Task 9 renders the error body and still lights Next (the failure is data)
- Testing / pytest → no new endpoints, existing tests cover. (Verified in spec; no task needed.)
- Testing / cypress → Task 13
- Testing / conductor dry-run → Task 12 step 2/3

**Placeholder scan:** No TBDs except one explicit footnote in Task 4 about verifying `localhost:8002/policies` against the live OpenAPI before merging — that's a *known* check, not a TBD in the implementation.

**Type consistency:**
- `mcpControl(service, action)` — same signature in api.ts (Task 2) and CmdK.tsx (Task 11). ✓
- `probeUrl(url)` returns `ProbeResult` with `{status, body}` — VerifyCard imports `ProbeResult` from `@/lib/schemas` (Task 9). ✓
- `LESSONS[i].mcp` is the literal union type `'mcp-user' | 'mcp-gitea' | ...` — passed as `string` to EnableCard, which is fine. ✓
- `setPendingPrompt(string | null)` — InputRow's effect uses `null` as the cleared sentinel (Task 3); HallucinateCard and VerifyCard pass strings (Tasks 7, 9). ✓
- `PHASE_COUNT` derived in lessons.ts as `1 + 1 + 3*4 + 1 + 1 = 16`; Workshop.tsx step ranges (Task 10) match: 0=intro, 1=cold-open, 2..13=per-MCP (4*3), 14=capstone, 15=wrap. ✓

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-01-workshop-wizard.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks. Best for correctness across 14 tasks; isolates context per change.
2. **Inline Execution** — I execute tasks in this session with batched checkpoints. Faster, more context drift risk.

Which approach?
