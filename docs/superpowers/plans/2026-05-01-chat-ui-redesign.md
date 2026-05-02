# chat-ui Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `chat-ui/app/static/` (vanilla JS/HTML/CSS, 3,800 lines) with a Vite + React + TypeScript + Tailwind + shadcn/ui frontend rendered into the same static directory. FastAPI backend untouched.

**Architecture:** New `chat-ui/web/` source directory builds into `chat-ui/app/static/`. Two-pane shell (chat + persistent inspector with Servers/Tools/Trace/Compare tabs). Header: brand + corner menu. Provider chip in input row. ⌘K palette for keyboard-first access. Single-file CSS variable system for theme + density. Multi-stage Dockerfile (node build → python runtime). One-PR cutover, no feature flag.

**Tech Stack:** Vite 5, React 18, TypeScript (strict), Tailwind 3, shadcn/ui (Radix + Tailwind), Zustand, TanStack Query, zod, Vitest, React Testing Library, axe-core, existing Cypress.

**Spec:** `docs/superpowers/specs/2026-05-01-chat-ui-redesign-design.md`

**Phasing:** Tasks 1–7 scaffold the project (the build runs end-to-end before any feature exists). Tasks 8–14 build the API + state layers. Tasks 15–22 build the chat pane. Tasks 23–28 build the inspector. Tasks 29–32 build ⌘K and shortcuts. Tasks 33–36 polish (walkthrough, errors, a11y). Tasks 37–40 cut over (Dockerfile, M9-WIP merge, delete old files, acceptance run).

**Commit cadence:** every task ends with a commit. Most tasks are 5–15 minutes total.

---

## Phase 1 — Scaffold

### Task 1: Initialize Vite + React + TS project at `chat-ui/web/`

**Files:**
- Create: `chat-ui/web/package.json`, `chat-ui/web/vite.config.ts`, `chat-ui/web/tsconfig.json`, `chat-ui/web/tsconfig.node.json`, `chat-ui/web/index.html`, `chat-ui/web/src/main.tsx`, `chat-ui/web/src/App.tsx`, `chat-ui/web/.gitignore`

- [ ] **Step 1: Scaffold Vite project**

```bash
cd chat-ui
npm create vite@latest web -- --template react-ts
cd web
npm install
```

- [ ] **Step 2: Configure build to write into `../app/static`**

Edit `chat-ui/web/vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  build: {
    outDir: '../app/static',
    emptyOutDir: true,
    assetsDir: 'assets',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
      '/health': 'http://localhost:3001',
    },
  },
})
```

- [ ] **Step 3: Verify the build emits into `../app/static`**

Run:

```bash
cd chat-ui/web && npm run build
ls ../app/static
```

Expected: `index.html` and `assets/` directory in `chat-ui/app/static/`. (The pre-existing files were also there; that's fine — Task 39 cleans them up.)

- [ ] **Step 4: Add web/ ignores**

Append to `chat-ui/web/.gitignore` if not already present:

```
node_modules
dist
*.local
```

- [ ] **Step 5: Commit**

```bash
git add chat-ui/web/package.json chat-ui/web/package-lock.json chat-ui/web/vite.config.ts chat-ui/web/tsconfig.json chat-ui/web/tsconfig.node.json chat-ui/web/index.html chat-ui/web/src chat-ui/web/.gitignore chat-ui/web/public 2>/dev/null
git commit -m "chat-ui/web: scaffold Vite + React + TS project"
```

---

### Task 2: Add Tailwind 3 + theme tokens + `--ui-scale`

**Files:**
- Create: `chat-ui/web/tailwind.config.ts`, `chat-ui/web/postcss.config.js`, `chat-ui/web/src/styles/globals.css`
- Modify: `chat-ui/web/src/main.tsx`

- [ ] **Step 1: Install Tailwind**

```bash
cd chat-ui/web
npm install -D tailwindcss@^3 postcss autoprefixer @tailwindcss/typography
npx tailwindcss init -p --ts
```

- [ ] **Step 2: Configure `tailwind.config.ts`**

```typescript
import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--surface-2) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        text: 'rgb(var(--text) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        faint: 'rgb(var(--faint) / <alpha-value>)',
        primary: 'rgb(var(--primary) / <alpha-value>)',
        'primary-fg': 'rgb(var(--primary-fg) / <alpha-value>)',
        ok: 'rgb(var(--ok) / <alpha-value>)',
        warn: 'rgb(var(--warn) / <alpha-value>)',
        err: 'rgb(var(--err) / <alpha-value>)',
        'tool-bg': 'rgb(var(--tool-bg) / <alpha-value>)',
        'tool-fg': 'rgb(var(--tool-fg) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        // Every size keys off --ui-scale so density bumps the whole ramp.
        xs: ['calc(11px * var(--ui-scale, 1))', { lineHeight: '1.5' }],
        sm: ['calc(13px * var(--ui-scale, 1))', { lineHeight: '1.5' }],
        base: ['calc(15px * var(--ui-scale, 1))', { lineHeight: '1.55' }],
        lg: ['calc(17px * var(--ui-scale, 1))', { lineHeight: '1.5' }],
        xl: ['calc(20px * var(--ui-scale, 1))', { lineHeight: '1.45' }],
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
} satisfies Config
```

- [ ] **Step 3: Define theme tokens in `src/styles/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --ui-scale: 1;

  /* Light theme tokens (RGB triplets so Tailwind can apply opacity) */
  --bg: 250 250 250;
  --surface: 255 255 255;
  --surface-2: 244 244 245;
  --border: 229 229 229;
  --text: 10 10 10;
  --muted: 82 82 82;
  --faint: 115 115 115;
  --primary: 10 10 10;
  --primary-fg: 255 255 255;
  --ok: 22 163 74;
  --warn: 245 158 11;
  --err: 239 68 68;
  --tool-bg: 219 234 254;
  --tool-fg: 29 78 216;
  color-scheme: light;
}

:root.dark {
  --bg: 10 10 10;
  --surface: 15 15 16;
  --surface-2: 23 23 23;
  --border: 38 38 38;
  --text: 250 250 250;
  --muted: 163 163 163;
  --faint: 115 115 115;
  --primary: 250 250 250;
  --primary-fg: 10 10 10;
  --ok: 34 197 94;
  --warn: 245 158 11;
  --err: 239 68 68;
  --tool-bg: 49 46 129;
  --tool-fg: 165 180 252;
  color-scheme: dark;
}

html, body, #root { height: 100%; }
body { background: rgb(var(--bg)); color: rgb(var(--text)); font-family: theme('fontFamily.sans'); }

/* Default density: Comfortable */
:root { --ui-scale: 1; }
:root[data-density='compact'] { --ui-scale: 0.85; }
:root[data-density='comfortable'] { --ui-scale: 1; }
:root[data-density='large'] { --ui-scale: 1.18; }
```

- [ ] **Step 4: Import the stylesheet from `main.tsx`**

```typescript
// chat-ui/web/src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

- [ ] **Step 5: Replace `App.tsx` with a sanity check**

```typescript
// chat-ui/web/src/App.tsx
export default function App() {
  return (
    <div className="min-h-screen bg-bg text-text font-sans p-8">
      <h1 className="text-xl font-semibold">MCP DevOps Lab</h1>
      <p className="text-sm text-muted mt-2">Tailwind + theme tokens are live.</p>
    </div>
  )
}
```

- [ ] **Step 6: Verify dev server**

Run `npm run dev` from `chat-ui/web/`. Open `http://localhost:5173`. Expected: white page, dark text "MCP DevOps Lab" + muted subtitle. Toggle `<html class="dark">` in devtools → page flips to dark theme. Toggle `<html data-density="large">` → text gets bigger.

- [ ] **Step 7: Commit**

```bash
git add chat-ui/web/tailwind.config.ts chat-ui/web/postcss.config.* chat-ui/web/src/styles chat-ui/web/src/main.tsx chat-ui/web/src/App.tsx chat-ui/web/package.json chat-ui/web/package-lock.json
git commit -m "chat-ui/web: tailwind + theme tokens + --ui-scale density variable"
```

---

### Task 3: Initialize shadcn/ui

**Files:**
- Create: `chat-ui/web/components.json`, `chat-ui/web/src/lib/utils.ts`

- [ ] **Step 1: Run shadcn init**

```bash
cd chat-ui/web
npx shadcn@latest init
```

Answer the prompts:
- Style: `New York`
- Base color: `Neutral`
- CSS variables: `Yes`
- Tailwind config: accept default
- Components alias: `@/components`
- Utils alias: `@/lib/utils`
- React Server Components: `No`

(shadcn writes `components.json` and `src/lib/utils.ts`. It will also amend `globals.css` with shadcn's own variables — keep them; they coexist with ours.)

- [ ] **Step 2: Add the components we'll need now**

```bash
npx shadcn@latest add button popover dialog tabs tooltip toast dropdown-menu command separator switch slider input textarea
```

- [ ] **Step 3: Sanity-check by rendering a Button in `App.tsx`**

```typescript
import { Button } from '@/components/ui/button'

export default function App() {
  return (
    <div className="min-h-screen bg-bg text-text p-8">
      <h1 className="text-xl font-semibold">MCP DevOps Lab</h1>
      <Button className="mt-4">Click me</Button>
    </div>
  )
}
```

Run dev server. Expected: a styled button renders.

- [ ] **Step 4: Commit**

```bash
git add chat-ui/web/components.json chat-ui/web/src/lib chat-ui/web/src/components chat-ui/web/src/styles/globals.css chat-ui/web/package.json chat-ui/web/package-lock.json chat-ui/web/tailwind.config.* chat-ui/web/tsconfig.json
git commit -m "chat-ui/web: shadcn/ui init + base primitives"
```

---

### Task 4: Add core libraries (zustand, TanStack Query, zod, react-markdown, cmdk)

**Files:**
- Modify: `chat-ui/web/package.json` (via npm install)

- [ ] **Step 1: Install runtime libraries**

```bash
cd chat-ui/web
npm install zustand @tanstack/react-query zod react-markdown remark-gfm cmdk shiki @radix-ui/react-icons
```

- [ ] **Step 2: Install dev libraries (testing)**

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom @vitest/ui @axe-core/react
```

- [ ] **Step 3: Configure Vitest in `vite.config.ts`**

Edit `chat-ui/web/vite.config.ts` — add to the export:

```typescript
// Add inside defineConfig({...})
test: {
  environment: 'jsdom',
  globals: true,
  setupFiles: ['./src/test/setup.ts'],
},
```

Add `/// <reference types="vitest" />` at the top of the file.

- [ ] **Step 4: Create `src/test/setup.ts`**

```typescript
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 5: Add an `npm test` script**

In `chat-ui/web/package.json` "scripts":

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 6: Verify Vitest runs**

Create `chat-ui/web/src/lib/utils.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { cn } from './utils'

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('a', 'b')).toBe('a b')
  })
})
```

Run:

```bash
npm test
```

Expected: 1 passing test.

- [ ] **Step 7: Commit**

```bash
git add chat-ui/web/package.json chat-ui/web/package-lock.json chat-ui/web/vite.config.ts chat-ui/web/src/test chat-ui/web/src/lib/utils.test.ts
git commit -m "chat-ui/web: add zustand, TanStack Query, zod, react-markdown, cmdk + vitest"
```

---

## Phase 2 — API layer

### Task 5: Define zod schemas for every `/api/*` response

**Files:**
- Create: `chat-ui/web/src/lib/schemas.ts`, `chat-ui/web/src/lib/schemas.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// chat-ui/web/src/lib/schemas.test.ts
import { describe, it, expect } from 'vitest'
import {
  ChatResponseSchema,
  McpStatusSchema,
  ProvidersResponseSchema,
  ToolsResponseSchema,
  HallucinationStateSchema,
} from './schemas'

describe('zod schemas', () => {
  it('parses a valid ChatResponse', () => {
    const valid = {
      reply: 'hello',
      tool_calls: [{ name: 'list_users', arguments: {}, result: '[]' }],
      token_usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 },
      confidence: { score: 0.9, label: 'High', source: 'heuristic', details: '' },
      hallucination_mode: false,
    }
    expect(() => ChatResponseSchema.parse(valid)).not.toThrow()
  })

  it('rejects a ChatResponse missing reply', () => {
    expect(() => ChatResponseSchema.parse({ tool_calls: [] })).toThrow()
  })

  it('parses an McpStatus list', () => {
    const valid = [{ name: 'gitea', status: 'online', port: 3000, latency_ms: 12 }]
    expect(() => McpStatusSchema.parse(valid)).not.toThrow()
  })

  it('parses HallucinationState', () => {
    expect(() => HallucinationStateSchema.parse({ enabled: true })).not.toThrow()
  })

  it('parses ProvidersResponse', () => {
    expect(() => ProvidersResponseSchema.parse({ providers: ['ollama'], current: 'ollama' })).not.toThrow()
  })

  it('parses ToolsResponse', () => {
    const valid = { tools: [{ name: 'list_users', description: 'x', inputSchema: { type: 'object', properties: {} } }] }
    expect(() => ToolsResponseSchema.parse(valid)).not.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

`npm test -- schemas` → all six fail (module not found).

- [ ] **Step 3: Implement schemas to match the actual backend (verified at `chat-ui/app/models.py`)**

```typescript
// chat-ui/web/src/lib/schemas.ts
import { z } from 'zod'

export const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
})
export type ChatMessage = z.infer<typeof ChatMessageSchema>

export const ToolCallSchema = z.object({
  name: z.string(),
  arguments: z.record(z.unknown()),
  result: z.string().nullable().optional(),
})
export type ToolCall = z.infer<typeof ToolCallSchema>

export const TokenUsageSchema = z.object({
  input_tokens: z.number().default(0),
  output_tokens: z.number().default(0),
  total_tokens: z.number().default(0),
})
export type TokenUsage = z.infer<typeof TokenUsageSchema>

export const ConfidenceSchema = z.object({
  score: z.number().default(0),
  label: z.string().default('Unknown'),
  source: z.string().default('heuristic'),
  details: z.string().default(''),
})

export const ChatResponseSchema = z.object({
  reply: z.string(),
  tool_calls: z.array(ToolCallSchema).default([]),
  token_usage: TokenUsageSchema.default({ input_tokens: 0, output_tokens: 0, total_tokens: 0 }),
  confidence: ConfidenceSchema.default({ score: 0, label: 'Unknown', source: 'heuristic', details: '' }),
  hallucination_mode: z.boolean().default(false),
})
export type ChatResponse = z.infer<typeof ChatResponseSchema>

export const McpServerSchema = z.object({
  name: z.string(),
  status: z.enum(['online', 'offline', 'degraded']).or(z.string()),
  port: z.number().nullable().optional(),
  latency_ms: z.number().nullable().optional(),
  url: z.string().nullable().optional(),
})
export type McpServer = z.infer<typeof McpServerSchema>

export const McpStatusSchema = z.array(McpServerSchema)

export const ProvidersResponseSchema = z.object({
  providers: z.array(z.string()),
  current: z.string().nullable().optional(),
})

export const ToolSchema = z.object({
  name: z.string(),
  description: z.string().default(''),
  inputSchema: z.unknown().optional(),
  category: z.string().optional(),
})
export const ToolsResponseSchema = z.object({
  tools: z.array(ToolSchema),
})
export type ToolDef = z.infer<typeof ToolSchema>

export const HallucinationStateSchema = z.object({
  enabled: z.boolean(),
})

export const VerifyResponseSchema = z.object({
  ok: z.boolean(),
  output: z.string().default(''),
  error: z.string().optional(),
})
```

- [ ] **Step 4: Run test to verify all pass**

`npm test -- schemas` → 6/6 passing.

- [ ] **Step 5: Cross-check against actual backend response shapes**

Run from one terminal:

```bash
cd chat-ui && uvicorn app.main:app --port 3001
```

From another:

```bash
curl -s localhost:3001/api/mcp-status | head -c 400
curl -s localhost:3001/api/tools | head -c 400
curl -s localhost:3001/api/hallucination-mode
curl -s localhost:3001/api/providers
```

If any actual field name differs from the schema, fix the schema. Re-run `npm test`. Document the corrections in the commit message.

- [ ] **Step 6: Commit**

```bash
git add chat-ui/web/src/lib/schemas.ts chat-ui/web/src/lib/schemas.test.ts
git commit -m "chat-ui/web: zod schemas for /api responses (verified against backend)"
```

---

### Task 6: Typed API client (`lib/api.ts`)

**Files:**
- Create: `chat-ui/web/src/lib/api.ts`, `chat-ui/web/src/lib/api.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// chat-ui/web/src/lib/api.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sendChat, getMcpStatus, setProvider, setHallucinationMode } from './api'

describe('api client', () => {
  beforeEach(() => {
    global.fetch = vi.fn()
  })

  it('POSTs /api/chat with body and parses response', async () => {
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        reply: 'hi',
        tool_calls: [],
        token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
        confidence: { score: 0.5, label: 'Medium', source: 'heuristic', details: '' },
        hallucination_mode: false,
      }),
    })
    const res = await sendChat({ message: 'hello', history: [] })
    expect(res.reply).toBe('hi')
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/chat',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('GETs /api/mcp-status and parses array', async () => {
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => [{ name: 'gitea', status: 'online', port: 3000 }],
    })
    const res = await getMcpStatus()
    expect(res[0].name).toBe('gitea')
  })

  it('throws ApiError when response shape is invalid', async () => {
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ unexpected: true }),
    })
    await expect(sendChat({ message: 'x', history: [] })).rejects.toThrow(/shape/)
  })

  it('POSTs /api/provider', async () => {
    ;(global.fetch as any).mockResolvedValue({ ok: true, json: async () => ({}) })
    await setProvider({ provider: 'ollama', model: 'llama3.1' })
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/provider',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('POSTs /api/hallucination-mode', async () => {
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ enabled: true }),
    })
    const r = await setHallucinationMode(true)
    expect(r.enabled).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

`npm test -- api` → all fail (module not found).

- [ ] **Step 3: Implement `lib/api.ts`**

```typescript
// chat-ui/web/src/lib/api.ts
import { z, type ZodTypeAny } from 'zod'
import {
  ChatResponseSchema, McpStatusSchema, ProvidersResponseSchema,
  ToolsResponseSchema, HallucinationStateSchema, VerifyResponseSchema,
  type ChatResponse, type ChatMessage, type ToolDef,
} from './schemas'

export class ApiError extends Error {
  constructor(message: string, public status?: number, public detail?: unknown) {
    super(message)
    this.name = 'ApiError'
  }
}

async function call<T extends ZodTypeAny>(
  url: string,
  schema: T,
  init?: RequestInit,
  signal?: AbortSignal,
): Promise<z.infer<T>> {
  let res: Response
  try {
    res = await fetch(url, { ...init, signal })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new ApiError('Network error', undefined, e)
  }
  if (!res.ok) {
    let detail: unknown
    try { detail = await res.json() } catch { /* ignore */ }
    throw new ApiError(`HTTP ${res.status}`, res.status, detail)
  }
  let body: unknown
  try { body = await res.json() } catch (e) {
    throw new ApiError('Invalid JSON', res.status, e)
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new ApiError('Backend response shape changed', res.status, parsed.error.format())
  }
  return parsed.data
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const sendChat = (req: { message: string; history: ChatMessage[] }, signal?: AbortSignal) =>
  call('/api/chat', ChatResponseSchema, json(req), signal)

export const getMcpStatus = (signal?: AbortSignal) =>
  call('/api/mcp-status', McpStatusSchema, undefined, signal)

export const getTools = (signal?: AbortSignal) =>
  call('/api/tools', ToolsResponseSchema, undefined, signal)

export const getProviders = (signal?: AbortSignal) =>
  call('/api/providers', ProvidersResponseSchema, undefined, signal)

export const setProvider = (cfg: { provider: string; api_key?: string; model?: string; base_url?: string }) =>
  call('/api/provider', z.unknown(), json(cfg))

export const getHallucinationMode = (signal?: AbortSignal) =>
  call('/api/hallucination-mode', HallucinationStateSchema, undefined, signal)

export const setHallucinationMode = (enabled: boolean) =>
  call('/api/hallucination-mode', HallucinationStateSchema, json({ enabled }))

export const probeServer = (name: string) =>
  call('/api/probe', VerifyResponseSchema, json({ name }))

export const sendChatCompare = (body: unknown) =>
  call('/api/chat-compare', z.unknown(), json(body))

export const getChatHistory = () =>
  call('/api/chat-history', z.unknown())

export const appendChatHistory = (msg: ChatMessage) =>
  call('/api/chat-history', z.unknown(), json(msg))

export const clearChatHistory = () =>
  call('/api/chat-history', z.unknown(), { method: 'DELETE' })

export type { ChatResponse, ToolDef }
```

- [ ] **Step 4: Run test to verify all pass**

`npm test -- api` → 5/5 passing.

- [ ] **Step 5: Commit**

```bash
git add chat-ui/web/src/lib/api.ts chat-ui/web/src/lib/api.test.ts
git commit -m "chat-ui/web: typed API client with zod runtime validation"
```

---

### Task 7: Wrap App in QueryClient + Toaster + Theme bootstrap

**Files:**
- Modify: `chat-ui/web/src/main.tsx`, `chat-ui/web/src/App.tsx`
- Create: `chat-ui/web/src/lib/query.ts`, `chat-ui/web/src/lib/theme.ts`

- [ ] **Step 1: Create query client**

```typescript
// chat-ui/web/src/lib/query.ts
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})
```

- [ ] **Step 2: Create theme bootstrap**

```typescript
// chat-ui/web/src/lib/theme.ts
export type Theme = 'light' | 'dark' | 'system'
export type Density = 'compact' | 'comfortable' | 'large'

const THEME_KEY = 'mcp-lab.theme'
const DENSITY_KEY = 'mcp-lab.density'
const SCALE_KEY = 'mcp-lab.scale'

export function applyTheme(theme: Theme) {
  const resolved =
    theme === 'system'
      ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : theme
  document.documentElement.classList.toggle('dark', resolved === 'dark')
  localStorage.setItem(THEME_KEY, theme)
}

export function applyDensity(d: Density, scale?: number) {
  document.documentElement.dataset.density = d
  if (typeof scale === 'number') {
    document.documentElement.style.setProperty('--ui-scale', String(scale))
    localStorage.setItem(SCALE_KEY, String(scale))
  } else {
    document.documentElement.style.removeProperty('--ui-scale')
    localStorage.removeItem(SCALE_KEY)
  }
  localStorage.setItem(DENSITY_KEY, d)
}

export function bootstrapTheme() {
  const t = (localStorage.getItem(THEME_KEY) as Theme) || 'dark'
  const d = (localStorage.getItem(DENSITY_KEY) as Density) || 'comfortable'
  const s = localStorage.getItem(SCALE_KEY)
  applyTheme(t)
  applyDensity(d, s ? Number(s) : undefined)
}
```

- [ ] **Step 3: Update `main.tsx` to bootstrap before render**

```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { queryClient } from './lib/query'
import { bootstrapTheme } from './lib/theme'
import { Toaster } from '@/components/ui/toaster'
import './styles/globals.css'

bootstrapTheme()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster />
    </QueryClientProvider>
  </React.StrictMode>,
)
```

- [ ] **Step 4: Verify dev still renders + theme persists**

Run `npm run dev`. Open browser. In devtools console: `localStorage.setItem('mcp-lab.theme','light'); location.reload()`. Page should now load light. Set back to `dark`.

- [ ] **Step 5: Commit**

```bash
git add chat-ui/web/src/lib/query.ts chat-ui/web/src/lib/theme.ts chat-ui/web/src/main.tsx
git commit -m "chat-ui/web: QueryClient + theme bootstrap (dark default, persisted)"
```

---

## Phase 3 — State (Zustand)

### Task 8: Zustand store

**Files:**
- Create: `chat-ui/web/src/lib/store.ts`, `chat-ui/web/src/lib/store.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// chat-ui/web/src/lib/store.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useLab } from './store'

describe('useLab store', () => {
  beforeEach(() => {
    useLab.setState(useLab.getInitialState(), true)
  })

  it('appends user messages', () => {
    useLab.getState().appendMessage({ id: '1', role: 'user', content: 'hi' })
    expect(useLab.getState().messages).toHaveLength(1)
  })

  it('clears messages', () => {
    useLab.getState().appendMessage({ id: '1', role: 'user', content: 'hi' })
    useLab.getState().clearMessages()
    expect(useLab.getState().messages).toHaveLength(0)
  })

  it('toggles inspector tab', () => {
    useLab.getState().setInspectorTab('tools')
    expect(useLab.getState().inspectorTab).toBe('tools')
  })

  it('tracks streaming abort controller', () => {
    const ac = new AbortController()
    useLab.getState().setAbort(ac)
    expect(useLab.getState().abort).toBe(ac)
  })

  it('tracks session token total', () => {
    useLab.getState().addTokens(100)
    useLab.getState().addTokens(50)
    expect(useLab.getState().sessionTokens).toBe(150)
  })
})
```

- [ ] **Step 2: Run to fail**

`npm test -- store` → fails (module not found).

- [ ] **Step 3: Implement the store**

```typescript
// chat-ui/web/src/lib/store.ts
import { create } from 'zustand'
import type { ToolCall } from './schemas'

export type Role = 'user' | 'assistant' | 'system'
export type ChatMessageView = {
  id: string
  role: Role
  content: string
  toolCalls?: ToolCall[]
  status?: 'pending' | 'ok' | 'error' | 'stopped'
  error?: string
}

export type InspectorTab = 'servers' | 'tools' | 'trace' | 'compare'

export type LabState = {
  messages: ChatMessageView[]
  appendMessage: (m: ChatMessageView) => void
  patchMessage: (id: string, patch: Partial<ChatMessageView>) => void
  clearMessages: () => void

  inspectorTab: InspectorTab
  setInspectorTab: (t: InspectorTab) => void

  cmdkOpen: boolean
  setCmdkOpen: (open: boolean) => void

  abort: AbortController | null
  setAbort: (ac: AbortController | null) => void

  sessionTokens: number
  addTokens: (n: number) => void
  resetTokens: () => void

  flyingBlind: boolean
  setFlyingBlind: (v: boolean) => void
}

export const useLab = create<LabState>((set) => ({
  messages: [],
  appendMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
  patchMessage: (id, patch) =>
    set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),
  clearMessages: () => set({ messages: [], sessionTokens: 0 }),

  inspectorTab: 'servers',
  setInspectorTab: (t) => set({ inspectorTab: t }),

  cmdkOpen: false,
  setCmdkOpen: (cmdkOpen) => set({ cmdkOpen }),

  abort: null,
  setAbort: (abort) => set({ abort }),

  sessionTokens: 0,
  addTokens: (n) => set((s) => ({ sessionTokens: s.sessionTokens + n })),
  resetTokens: () => set({ sessionTokens: 0 }),

  flyingBlind: false,
  setFlyingBlind: (flyingBlind) => set({ flyingBlind }),
}))
```

- [ ] **Step 4: Pass tests**

`npm test -- store` → all pass.

- [ ] **Step 5: Commit**

```bash
git add chat-ui/web/src/lib/store.ts chat-ui/web/src/lib/store.test.ts
git commit -m "chat-ui/web: zustand store for messages, inspector tab, abort, tokens"
```

---

## Phase 4 — Shell components

### Task 9: Two-pane shell layout in `App.tsx`

**Files:**
- Modify: `chat-ui/web/src/App.tsx`
- Create: `chat-ui/web/src/components/Header.tsx`, `chat-ui/web/src/components/ChatPane.tsx`, `chat-ui/web/src/components/Inspector.tsx`, `chat-ui/web/src/components/InputRow.tsx`

- [ ] **Step 1: Create placeholder shells for each region**

```typescript
// chat-ui/web/src/components/Header.tsx
export function Header() {
  return (
    <header className="flex items-center justify-between px-5 py-3 border-b border-border bg-surface">
      <div className="flex items-center gap-2.5">
        <div className="w-[18px] h-[18px] rounded bg-text" />
        <span className="font-semibold text-sm">MCP DevOps Lab</span>
      </div>
      <button
        type="button"
        className="px-2 py-1 rounded-md border border-border bg-surface-2 text-muted hover:text-text"
        aria-label="Open menu"
      >
        ⋯
      </button>
    </header>
  )
}
```

```typescript
// chat-ui/web/src/components/ChatPane.tsx
export function ChatPane() {
  return <div className="flex-1 min-w-0 overflow-y-auto px-5 py-4">chat</div>
}
```

```typescript
// chat-ui/web/src/components/Inspector.tsx
export function Inspector() {
  return (
    <aside className="w-[360px] shrink-0 border-l border-border bg-surface overflow-y-auto">
      inspector
    </aside>
  )
}
```

```typescript
// chat-ui/web/src/components/InputRow.tsx
export function InputRow() {
  return (
    <div className="border-t border-border bg-surface px-5 py-3 flex items-center gap-2">
      <span className="text-xs text-muted px-2 py-1 rounded-md border border-border bg-bg whitespace-nowrap">
        ⬩ ollama · llama3.1 · 0 tok ▾
      </span>
      <input
        className="flex-1 bg-bg border border-border rounded-md px-3 py-2 text-sm placeholder-faint"
        placeholder="Ask the lab…"
      />
      <button className="bg-primary text-primary-fg rounded-md px-3 py-2 text-sm font-medium">
        Send
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Compose them in `App.tsx`**

```typescript
import { Header } from '@/components/Header'
import { ChatPane } from '@/components/ChatPane'
import { Inspector } from '@/components/Inspector'
import { InputRow } from '@/components/InputRow'

export default function App() {
  return (
    <div className="h-screen flex flex-col bg-bg text-text">
      <Header />
      <div className="flex-1 flex min-h-0">
        <ChatPane />
        <Inspector />
      </div>
      <InputRow />
    </div>
  )
}
```

- [ ] **Step 3: Verify in browser**

Run `npm run dev`. Expected: header bar with brand and ⋯ on right, two-column body (gray "chat" left, "inspector" right rail), input row at bottom with provider chip, textarea, Send button.

- [ ] **Step 4: Commit**

```bash
git add chat-ui/web/src/App.tsx chat-ui/web/src/components
git commit -m "chat-ui/web: two-pane shell layout (header / chat / inspector / input)"
```

---

### Task 10: Corner menu (⋯) with theme + density + Flying Blind + walkthrough + clear + shortcuts

**Files:**
- Modify: `chat-ui/web/src/components/Header.tsx`
- Create: `chat-ui/web/src/components/CornerMenu.tsx`, `chat-ui/web/src/components/CornerMenu.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// chat-ui/web/src/components/CornerMenu.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CornerMenu } from './CornerMenu'

describe('CornerMenu', () => {
  it('opens on click and shows theme + density sections', async () => {
    render(<CornerMenu />)
    await userEvent.click(screen.getByRole('button', { name: /open menu/i }))
    expect(await screen.findByText(/theme/i)).toBeInTheDocument()
    expect(screen.getByText(/density/i)).toBeInTheDocument()
    expect(screen.getByText(/flying blind/i)).toBeInTheDocument()
  })

  it('toggles density when Large is clicked', async () => {
    render(<CornerMenu />)
    await userEvent.click(screen.getByRole('button', { name: /open menu/i }))
    await userEvent.click(screen.getByRole('button', { name: /^large$/i }))
    expect(document.documentElement.dataset.density).toBe('large')
  })

  it('toggles theme to light', async () => {
    render(<CornerMenu />)
    await userEvent.click(screen.getByRole('button', { name: /open menu/i }))
    await userEvent.click(screen.getByRole('button', { name: /^light$/i }))
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})
```

- [ ] **Step 2: Run to fail**

`npm test -- CornerMenu` → fails.

- [ ] **Step 3: Implement `CornerMenu.tsx`**

```typescript
// chat-ui/web/src/components/CornerMenu.tsx
import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { applyTheme, applyDensity, type Theme, type Density } from '@/lib/theme'
import { useLab } from '@/lib/store'
import { setHallucinationMode } from '@/lib/api'

const THEMES: { v: Theme; label: string }[] = [
  { v: 'light', label: '☼ Light' },
  { v: 'dark', label: '☽ Dark' },
  { v: 'system', label: '⚙ System' },
]
const DENSITIES: { v: Density; label: string }[] = [
  { v: 'compact', label: 'Compact' },
  { v: 'comfortable', label: 'Comfortable' },
  { v: 'large', label: 'Large' },
]

export function CornerMenu() {
  const flyingBlind = useLab((s) => s.flyingBlind)
  const setFlying = useLab((s) => s.setFlyingBlind)
  const clearMessages = useLab((s) => s.clearMessages)

  const [theme, setTheme] = useState<Theme>(
    (localStorage.getItem('mcp-lab.theme') as Theme) || 'dark',
  )
  const [density, setDensity] = useState<Density>(
    (localStorage.getItem('mcp-lab.density') as Density) || 'comfortable',
  )
  const [scale, setScale] = useState<number>(
    Number(localStorage.getItem('mcp-lab.scale')) || 1,
  )

  function pickTheme(t: Theme) { setTheme(t); applyTheme(t) }
  function pickDensity(d: Density) {
    setDensity(d)
    const presetScale = d === 'compact' ? 0.85 : d === 'large' ? 1.18 : 1
    setScale(presetScale)
    applyDensity(d, presetScale)
  }
  function pickScale(s: number) { setScale(s); applyDensity(density, s) }
  async function toggleFlying() {
    const next = !flyingBlind
    setFlying(next)
    await setHallucinationMode(next)
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="px-2 py-1 rounded-md border border-border bg-surface-2 text-muted hover:text-text"
          aria-label="Open menu"
        >
          ⋯
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[280px] p-2">
        <Section label="Theme">
          <Segmented options={THEMES} value={theme} onChange={pickTheme} />
        </Section>
        <Section label="Density">
          <Segmented options={DENSITIES} value={density} onChange={pickDensity} />
          <div className="flex items-center gap-2 px-2 mt-2">
            <span className="text-[10px]">A</span>
            <Slider
              min={0.7} max={1.4} step={0.01} value={[scale]}
              onValueChange={(v) => pickScale(v[0])}
              className="flex-1"
            />
            <span className="text-sm">A</span>
            <span className="text-xs text-muted w-10 text-right">{Math.round(scale * 100)}%</span>
          </div>
        </Section>
        <Divider />
        <Row>
          <span>⚠ Flying Blind <span className="text-faint text-xs">no tools</span></span>
          <Switch checked={flyingBlind} onCheckedChange={toggleFlying} />
        </Row>
        <Divider />
        <RowButton onClick={() => useLab.setState({ /* walkthrough later */ })}>
          Walkthrough <Kbd>first run</Kbd>
        </RowButton>
        <RowButton onClick={clearMessages}>
          Clear chat <Kbd>⇧⌘ ⌫</Kbd>
        </RowButton>
        <RowButton onClick={() => alert('Shortcuts dialog wired in Task 32')}>
          Keyboard shortcuts <Kbd>?</Kbd>
        </RowButton>
        <Divider />
        <RowButton onClick={() => useLab.getState().setCmdkOpen(true)}>
          <span className="text-muted">Open Command Palette</span> <Kbd>⌘ K</Kbd>
        </RowButton>
      </PopoverContent>
    </Popover>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <div className="text-[10px] uppercase tracking-wider text-faint px-2 pt-2 pb-1">{label}</div>
      {children}
    </div>
  )
}
function Segmented<T extends string>({ options, value, onChange }: { options: { v: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="grid grid-cols-3 mx-2 border border-border rounded-md overflow-hidden">
      {options.map(({ v, label }, i) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={[
            'py-1.5 text-xs',
            i < options.length - 1 ? 'border-r border-border' : '',
            v === value ? 'bg-text text-bg font-semibold' : 'bg-surface-2 text-muted',
          ].join(' ')}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-between px-2 py-1.5 text-sm">{children}</div>
}
function RowButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between px-2 py-1.5 text-sm rounded-md hover:bg-surface-2"
    >
      {children}
    </button>
  )
}
function Divider() { return <div className="h-px bg-border my-1.5 mx-1" /> }
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] bg-surface-2 border border-border border-b-2 rounded px-1.5 py-0.5 text-muted">
      {children}
    </span>
  )
}
```

- [ ] **Step 4: Wire `<CornerMenu />` into `Header.tsx`**

Replace the placeholder ⋯ button with `<CornerMenu />`:

```typescript
import { CornerMenu } from './CornerMenu'

export function Header() {
  return (
    <header className="flex items-center justify-between px-5 py-3 border-b border-border bg-surface">
      <div className="flex items-center gap-2.5">
        <div className="w-[18px] h-[18px] rounded bg-text" />
        <span className="font-semibold text-sm">MCP DevOps Lab</span>
      </div>
      <CornerMenu />
    </header>
  )
}
```

- [ ] **Step 5: Run tests + browser sanity**

`npm test -- CornerMenu` → passes. Open dev server: clicking ⋯ shows the popover, segmented controls work, slider scales the UI live.

- [ ] **Step 6: Commit**

```bash
git add chat-ui/web/src/components/CornerMenu.tsx chat-ui/web/src/components/CornerMenu.test.tsx chat-ui/web/src/components/Header.tsx
git commit -m "chat-ui/web: corner menu (theme, density+slider, flying blind, clear, shortcuts hint)"
```

---

### Task 11: Provider chip + popover in input row

**Files:**
- Modify: `chat-ui/web/src/components/InputRow.tsx`
- Create: `chat-ui/web/src/components/ProviderChip.tsx`, `chat-ui/web/src/components/ProviderChip.test.tsx`, `chat-ui/web/src/lib/settings.ts`

- [ ] **Step 1: Create persisted settings helpers**

```typescript
// chat-ui/web/src/lib/settings.ts
export type Settings = {
  provider: string
  model: string
  apiKey: string
  baseUrl?: string
}

const KEY = 'mcp-lab.settings'

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { provider: 'ollama', model: 'llama3.1', apiKey: '', ...JSON.parse(raw) }
  } catch {}
  return { provider: 'ollama', model: 'llama3.1', apiKey: '' }
}

export function saveSettings(s: Settings) {
  localStorage.setItem(KEY, JSON.stringify(s))
}
```

- [ ] **Step 2: Implement `ProviderChip.tsx`**

```typescript
// chat-ui/web/src/components/ProviderChip.tsx
import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { setProvider } from '@/lib/api'
import { loadSettings, saveSettings } from '@/lib/settings'
import { useLab } from '@/lib/store'

const PROVIDERS = [
  { v: 'ollama', label: 'Ollama (Local)' },
  { v: 'openai', label: 'OpenAI' },
  { v: 'anthropic', label: 'Anthropic' },
  { v: 'google', label: 'Google Gemini' },
  { v: 'pretend', label: 'Demo LLM' },
]

export function ProviderChip() {
  const [s, setS] = useState(loadSettings())
  const [busy, setBusy] = useState(false)
  const tokens = useLab((x) => x.sessionTokens)

  async function apply() {
    setBusy(true)
    try {
      await setProvider({ provider: s.provider, api_key: s.apiKey || undefined, model: s.model || undefined, base_url: s.baseUrl })
      saveSettings(s)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-xs text-muted px-2 py-1 rounded-md border border-border bg-bg whitespace-nowrap hover:text-text"
        >
          ⬩ {s.provider} · {s.model || '—'} · {tokens.toLocaleString()} tok ▾
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[320px] p-3 space-y-3">
        <div>
          <Label>Provider</Label>
          <select
            className="w-full bg-bg border border-border rounded-md text-sm px-2 py-1.5"
            value={s.provider}
            onChange={(e) => setS({ ...s, provider: e.target.value })}
          >
            {PROVIDERS.map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <Label>Model</Label>
          <Input value={s.model} onChange={(e) => setS({ ...s, model: e.target.value })} placeholder="llama3.1" />
        </div>
        <div>
          <Label>API key</Label>
          <Input type="password" value={s.apiKey} onChange={(e) => setS({ ...s, apiKey: e.target.value })} placeholder="sk-…" />
        </div>
        <div className="flex justify-between items-center text-xs text-muted">
          <span>Session tokens: <span className="text-text">{tokens.toLocaleString()}</span></span>
          <Button size="sm" onClick={apply} disabled={busy}>
            {busy ? 'Applying…' : 'Apply'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase tracking-wider text-faint mb-1">{children}</div>
}
```

- [ ] **Step 3: Wire into `InputRow.tsx`**

Replace the placeholder span with `<ProviderChip />`:

```typescript
import { ProviderChip } from './ProviderChip'

export function InputRow() {
  return (
    <div className="border-t border-border bg-surface px-5 py-3 flex items-center gap-2">
      <ProviderChip />
      <input
        className="flex-1 bg-bg border border-border rounded-md px-3 py-2 text-sm placeholder-faint"
        placeholder="Ask the lab…"
      />
      <button className="bg-primary text-primary-fg rounded-md px-3 py-2 text-sm font-medium">
        Send
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Quick test that the chip renders**

```typescript
// chat-ui/web/src/components/ProviderChip.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProviderChip } from './ProviderChip'

describe('ProviderChip', () => {
  it('renders provider + model + tok suffix', () => {
    render(<ProviderChip />)
    expect(screen.getByRole('button', { name: /ollama/i })).toBeInTheDocument()
  })
})
```

`npm test -- ProviderChip` → passes.

- [ ] **Step 5: Commit**

```bash
git add chat-ui/web/src/components/ProviderChip.tsx chat-ui/web/src/components/ProviderChip.test.tsx chat-ui/web/src/components/InputRow.tsx chat-ui/web/src/lib/settings.ts
git commit -m "chat-ui/web: provider chip + popover (model, key, session tokens)"
```

---

### Task 12: Real input row with auto-grow textarea + Send/Stop

**Files:**
- Modify: `chat-ui/web/src/components/InputRow.tsx`
- Create: `chat-ui/web/src/lib/chat.ts`

- [ ] **Step 1: Implement `chat.ts` send action (no UI yet)**

```typescript
// chat-ui/web/src/lib/chat.ts
import { sendChat } from './api'
import { useLab, type ChatMessageView } from './store'
import { appendChatHistory } from './api'

let nextId = 1
const id = () => `m${nextId++}`

export async function send(input: string) {
  const text = input.trim()
  if (!text) return
  const state = useLab.getState()
  const userMsg: ChatMessageView = { id: id(), role: 'user', content: text, status: 'ok' }
  state.appendMessage(userMsg)
  const pendingId = id()
  state.appendMessage({ id: pendingId, role: 'assistant', content: '', status: 'pending' })

  const ac = new AbortController()
  state.setAbort(ac)
  try {
    const res = await sendChat(
      {
        message: text,
        history: state.messages.map((m) => ({ role: m.role === 'system' ? 'system' : m.role, content: m.content })),
      },
      ac.signal,
    )
    state.patchMessage(pendingId, {
      content: res.reply,
      toolCalls: res.tool_calls,
      status: 'ok',
    })
    state.addTokens(res.token_usage.total_tokens)
    appendChatHistory({ role: 'user', content: text }).catch(() => {})
    appendChatHistory({ role: 'assistant', content: res.reply }).catch(() => {})
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      state.patchMessage(pendingId, { status: 'stopped', content: '(stopped)' })
    } else {
      state.patchMessage(pendingId, { status: 'error', error: e?.message || 'Failed' })
    }
  } finally {
    state.setAbort(null)
  }
}
```

- [ ] **Step 2: Wire `InputRow.tsx` to `send` with auto-grow + Stop button**

```typescript
// chat-ui/web/src/components/InputRow.tsx
import { useRef, useState } from 'react'
import { ProviderChip } from './ProviderChip'
import { useLab } from '@/lib/store'
import { send } from '@/lib/chat'

export function InputRow() {
  const [value, setValue] = useState('')
  const ta = useRef<HTMLTextAreaElement>(null)
  const abort = useLab((s) => s.abort)
  const isStreaming = abort != null

  function autoGrow() {
    const el = ta.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 240) + 'px'
  }

  async function submit() {
    if (!value.trim() || isStreaming) return
    const text = value
    setValue('')
    queueMicrotask(autoGrow)
    await send(text)
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="border-t border-border bg-surface px-5 py-3 flex items-end gap-2">
      <ProviderChip />
      <textarea
        ref={ta}
        rows={1}
        value={value}
        onChange={(e) => { setValue(e.target.value); autoGrow() }}
        onKeyDown={onKey}
        className="flex-1 bg-bg border border-border rounded-md px-3 py-2 text-sm placeholder-faint resize-none max-h-60"
        placeholder="Ask the lab…"
      />
      {isStreaming ? (
        <button
          onClick={() => abort?.abort()}
          className="bg-err text-white rounded-md px-3 py-2 text-sm font-medium"
        >
          Stop
        </button>
      ) : (
        <button
          onClick={submit}
          disabled={!value.trim()}
          className="bg-primary text-primary-fg rounded-md px-3 py-2 text-sm font-medium disabled:opacity-40"
        >
          Send
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Manual sanity check**

Start backend (`uvicorn app.main:app --port 3001` from `chat-ui/`). In `chat-ui/web/`, `npm run dev`. Type a message + Enter. The store should now have user + (pending) assistant message — they don't render yet. Check with React DevTools or the next task. (We're not yet rendering messages — Task 14 does that.)

- [ ] **Step 4: Commit**

```bash
git add chat-ui/web/src/components/InputRow.tsx chat-ui/web/src/lib/chat.ts
git commit -m "chat-ui/web: input row with auto-grow textarea, Enter to send, Stop button"
```

---

## Phase 5 — Chat pane

### Task 13: Message components

**Files:**
- Create: `chat-ui/web/src/features/chat/UserMessage.tsx`, `AssistantMessage.tsx`, `ToolCallSummary.tsx`, `ToolCallExpanded.tsx`, plus tests for each.

- [ ] **Step 1: Implement components**

```typescript
// chat-ui/web/src/features/chat/UserMessage.tsx
export function UserMessage({ content }: { content: string }) {
  return (
    <div className="self-end max-w-[75%] bg-primary text-primary-fg rounded-[10px] px-3 py-2 text-base whitespace-pre-wrap break-words">
      {content}
    </div>
  )
}
```

```typescript
// chat-ui/web/src/features/chat/AssistantMessage.tsx
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export function AssistantMessage({ content, status }: { content: string; status?: string }) {
  return (
    <div className="self-start max-w-[90%] bg-surface-2 border border-border rounded-[10px] px-3 py-2 text-base prose prose-sm dark:prose-invert prose-code:bg-bg prose-code:border prose-code:border-border prose-code:rounded prose-code:px-1 prose-code:font-mono">
      {status === 'pending' ? (
        <span className="text-muted italic">…</span>
      ) : (
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      )}
    </div>
  )
}
```

```typescript
// chat-ui/web/src/features/chat/ToolCallSummary.tsx
import { useState } from 'react'
import { ToolCallExpanded } from './ToolCallExpanded'
import type { ToolCall } from '@/lib/schemas'

export function ToolCallSummary({ call }: { call: ToolCall }) {
  const [open, setOpen] = useState(false)
  const ok = call.result != null && !String(call.result).startsWith('Error')
  return (
    <div className="my-1">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-sm text-muted px-1 py-0.5 hover:text-text w-full text-left"
      >
        <span className="bg-tool-bg text-tool-fg px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide">tool</span>
        <span className="font-mono text-text">{call.name}</span>
        <span className={ok ? 'text-ok' : 'text-err'}>{ok ? '✓' : '✗'}</span>
        <span className="ml-auto text-faint text-xs">{open ? '▴ collapse' : '▾ expand'}</span>
      </button>
      {open && <ToolCallExpanded call={call} />}
    </div>
  )
}
```

```typescript
// chat-ui/web/src/features/chat/ToolCallExpanded.tsx
import type { ToolCall } from '@/lib/schemas'

const MAX = 2048
function truncate(s: string) {
  if (s.length <= MAX) return { text: s, more: 0 }
  return { text: s.slice(0, MAX), more: s.length - MAX }
}

export function ToolCallExpanded({ call }: { call: ToolCall }) {
  const argsStr = JSON.stringify(call.arguments, null, 2)
  const resultStr = call.result == null ? '(no result)' : String(call.result)
  const a = truncate(argsStr)
  const r = truncate(resultStr)
  return (
    <div className="bg-surface-2 border border-border rounded-[10px] p-3 my-1 font-mono text-xs">
      <Label>arguments</Label>
      <Block text={a.text} more={a.more} full={argsStr} />
      <Label>result</Label>
      <Block text={r.text} more={r.more} full={resultStr} />
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="font-sans text-[10px] uppercase tracking-wider text-muted mb-1">{children}</div>
}

function Block({ text, more, full }: { text: string; more: number; full: string }) {
  return (
    <div className="mb-2">
      <pre className="whitespace-pre-wrap text-text">{text}{more > 0 && <span className="text-faint">… (+{more} bytes)</span>}</pre>
      <button
        type="button"
        onClick={() => navigator.clipboard.writeText(full)}
        className="text-xs text-muted hover:text-text underline"
      >
        copy
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Component tests**

```typescript
// chat-ui/web/src/features/chat/messages.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UserMessage } from './UserMessage'
import { AssistantMessage } from './AssistantMessage'
import { ToolCallSummary } from './ToolCallSummary'

describe('messages', () => {
  it('renders user content', () => {
    render(<UserMessage content="hello" />)
    expect(screen.getByText('hello')).toBeInTheDocument()
  })

  it('renders assistant markdown', () => {
    render(<AssistantMessage content="**bold**" />)
    expect(screen.getByText('bold').tagName).toBe('STRONG')
  })

  it('expands/collapses tool calls', async () => {
    render(<ToolCallSummary call={{ name: 'list_users', arguments: {}, result: '[]' }} />)
    expect(screen.queryByText(/arguments/i)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByText(/arguments/i)).toBeInTheDocument()
  })
})
```

`npm test -- messages` → all pass.

- [ ] **Step 3: Commit**

```bash
git add chat-ui/web/src/features/chat
git commit -m "chat-ui/web: chat message components (User, Assistant, ToolCall summary+expanded)"
```

---

### Task 14: MessageList in `ChatPane.tsx`

**Files:**
- Modify: `chat-ui/web/src/components/ChatPane.tsx`
- Create: `chat-ui/web/src/features/chat/MessageList.tsx`

- [ ] **Step 1: Implement MessageList**

```typescript
// chat-ui/web/src/features/chat/MessageList.tsx
import { useEffect, useRef } from 'react'
import { useLab } from '@/lib/store'
import { UserMessage } from './UserMessage'
import { AssistantMessage } from './AssistantMessage'
import { ToolCallSummary } from './ToolCallSummary'

export function MessageList() {
  const messages = useLab((s) => s.messages)
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)

  function onScroll() {
    const el = scrollRef.current
    if (!el) return
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
  }

  useEffect(() => {
    if (stickToBottom.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
    }
  }, [messages])

  return (
    <div ref={scrollRef} onScroll={onScroll} className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
      <div className="flex flex-col gap-2 max-w-3xl mx-auto">
        {messages.length === 0 && (
          <div className="text-muted text-center py-12 text-sm">
            Welcome to the MCP DevOps Lab. Pick a provider in the chip below and start chatting.
          </div>
        )}
        {messages.map((m) =>
          m.role === 'user' ? (
            <UserMessage key={m.id} content={m.content} />
          ) : (
            <div key={m.id} className="flex flex-col gap-1 self-start w-full">
              {m.toolCalls?.map((tc, i) => <ToolCallSummary key={i} call={tc} />)}
              <AssistantMessage content={m.content} status={m.status} />
              {m.status === 'error' && (
                <div className="text-err text-xs">⚠ {m.error}</div>
              )}
            </div>
          ),
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Use it in ChatPane**

```typescript
// chat-ui/web/src/components/ChatPane.tsx
import { MessageList } from '@/features/chat/MessageList'

export function ChatPane() {
  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <MessageList />
    </div>
  )
}
```

- [ ] **Step 3: End-to-end manual check**

Start backend + dev server. Type "list users" + Enter. Expected: user bubble appears immediately, then a moment later the assistant message + tool-call summary appear. Click the chevron — args/result expand.

- [ ] **Step 4: Commit**

```bash
git add chat-ui/web/src/features/chat/MessageList.tsx chat-ui/web/src/components/ChatPane.tsx
git commit -m "chat-ui/web: MessageList with auto-scroll-on-new + stick-to-bottom"
```

---

## Phase 6 — Inspector

### Task 15: Inspector tabs container

**Files:**
- Modify: `chat-ui/web/src/components/Inspector.tsx`
- Create: `chat-ui/web/src/features/servers/ServersTab.tsx`, `chat-ui/web/src/features/tools/ToolsTab.tsx`, `chat-ui/web/src/features/trace/TraceTab.tsx`, `chat-ui/web/src/features/compare/CompareTab.tsx` (placeholders for now)

- [ ] **Step 1: Placeholder tab content modules**

```typescript
// chat-ui/web/src/features/servers/ServersTab.tsx
export function ServersTab() { return <div className="p-3 text-sm text-muted">Servers</div> }
// chat-ui/web/src/features/tools/ToolsTab.tsx
export function ToolsTab() { return <div className="p-3 text-sm text-muted">Tools</div> }
// chat-ui/web/src/features/trace/TraceTab.tsx
export function TraceTab() { return <div className="p-3 text-sm text-muted">Trace</div> }
// chat-ui/web/src/features/compare/CompareTab.tsx
export function CompareTab() { return <div className="p-3 text-sm text-muted">Compare</div> }
```

- [ ] **Step 2: Replace `Inspector.tsx` with Radix Tabs bound to store**

```typescript
// chat-ui/web/src/components/Inspector.tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useLab, type InspectorTab } from '@/lib/store'
import { ServersTab } from '@/features/servers/ServersTab'
import { ToolsTab } from '@/features/tools/ToolsTab'
import { TraceTab } from '@/features/trace/TraceTab'
import { CompareTab } from '@/features/compare/CompareTab'

export function Inspector() {
  const tab = useLab((s) => s.inspectorTab)
  const setTab = useLab((s) => s.setInspectorTab)
  return (
    <aside className="w-[360px] shrink-0 border-l border-border bg-surface flex flex-col">
      <Tabs value={tab} onValueChange={(v) => setTab(v as InspectorTab)} className="flex flex-col flex-1 min-h-0">
        <TabsList className="bg-transparent justify-start gap-3 px-3 pt-3 pb-2 h-auto rounded-none border-b border-border">
          {(['servers', 'tools', 'trace', 'compare'] as const).map((t) => (
            <TabsTrigger
              key={t}
              value={t}
              className="capitalize text-xs px-0 pb-1.5 rounded-none data-[state=active]:bg-transparent data-[state=active]:text-text data-[state=active]:font-semibold data-[state=active]:border-b-2 data-[state=active]:border-text data-[state=inactive]:text-muted"
            >
              {t}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <TabsContent value="servers" className="m-0"><ServersTab /></TabsContent>
          <TabsContent value="tools" className="m-0"><ToolsTab /></TabsContent>
          <TabsContent value="trace" className="m-0"><TraceTab /></TabsContent>
          <TabsContent value="compare" className="m-0"><CompareTab /></TabsContent>
        </div>
      </Tabs>
    </aside>
  )
}
```

- [ ] **Step 3: Browser sanity**

Inspector now shows tabs (Servers, Tools, Trace, Compare); click each — content swaps.

- [ ] **Step 4: Commit**

```bash
git add chat-ui/web/src/components/Inspector.tsx chat-ui/web/src/features/servers chat-ui/web/src/features/tools chat-ui/web/src/features/trace chat-ui/web/src/features/compare
git commit -m "chat-ui/web: inspector tabs container (Servers/Tools/Trace/Compare)"
```

---

### Task 16: Servers tab — live status + verify-curl

**Files:**
- Modify: `chat-ui/web/src/features/servers/ServersTab.tsx`
- Create: `chat-ui/web/src/features/servers/useServers.ts`

- [ ] **Step 1: Adaptive-polling hook**

```typescript
// chat-ui/web/src/features/servers/useServers.ts
import { useQuery } from '@tanstack/react-query'
import { getMcpStatus } from '@/lib/api'

export function useServers() {
  const q = useQuery({
    queryKey: ['mcp-status'],
    queryFn: ({ signal }) => getMcpStatus(signal),
  })
  const anyOffline = q.data?.some((s) => s.status !== 'online') ?? false
  // Adaptive cadence: 3s if any offline, otherwise 30s
  return useQuery({
    queryKey: ['mcp-status', anyOffline],
    queryFn: ({ signal }) => getMcpStatus(signal),
    refetchInterval: anyOffline ? 3000 : 30000,
    initialData: q.data,
  })
}
```

- [ ] **Step 2: Implement Servers tab**

```typescript
// chat-ui/web/src/features/servers/ServersTab.tsx
import { useState } from 'react'
import { useServers } from './useServers'
import { probeServer } from '@/lib/api'

export function ServersTab() {
  const { data, isLoading, error } = useServers()
  if (isLoading) return <div className="p-3 text-sm text-muted">Loading…</div>
  if (error) return <div className="p-3 text-sm text-err">Failed to load servers.</div>
  return (
    <div className="p-3 flex flex-col gap-1.5">
      {data?.map((s) => <ServerRow key={s.name} server={s} />)}
    </div>
  )
}

function ServerRow({ server }: { server: { name: string; status: string; port?: number | null; latency_ms?: number | null } }) {
  const [verifyResult, setVerifyResult] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const dotColor = server.status === 'online' ? 'bg-ok' : server.status === 'degraded' ? 'bg-warn' : 'bg-err'
  async function verify() {
    setBusy(true)
    try {
      const r = await probeServer(server.name)
      setVerifyResult(r.ok ? r.output : (r.error || 'failed'))
    } catch (e: any) {
      setVerifyResult(e?.message || 'failed')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="bg-surface-2 border border-border rounded-md text-sm">
      <div className="flex items-center justify-between px-2.5 py-2">
        <span className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
          {server.name}
        </span>
        <span className="flex items-center gap-2 text-xs text-faint">
          {server.port != null && `:${server.port}`}
          {server.latency_ms != null && `· ${server.latency_ms}ms`}
          <button
            onClick={verify}
            disabled={busy}
            className="bg-bg border border-border rounded px-2 py-0.5 text-muted hover:text-text disabled:opacity-50"
          >
            {busy ? '…' : 'verify'}
          </button>
        </span>
      </div>
      {verifyResult && (
        <pre className="bg-bg border-t border-border text-[11px] font-mono p-2 whitespace-pre-wrap max-h-48 overflow-auto">{verifyResult}</pre>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Sanity check**

Backend running: Servers tab shows the live MCP servers with green dots; clicking "verify" runs `/api/probe` and renders the result inline.

- [ ] **Step 4: Commit**

```bash
git add chat-ui/web/src/features/servers
git commit -m "chat-ui/web: Servers tab with adaptive polling + inline verify-curl"
```

---

### Task 17: Tools tab — grouped catalog + drawer

**Files:**
- Modify: `chat-ui/web/src/features/tools/ToolsTab.tsx`
- Create: `chat-ui/web/src/features/tools/ToolDrawer.tsx`

- [ ] **Step 1: Group helper + tab**

```typescript
// chat-ui/web/src/features/tools/ToolsTab.tsx
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getTools } from '@/lib/api'
import type { ToolDef } from '@/lib/schemas'
import { ToolDrawer } from './ToolDrawer'

const CATEGORY_FROM_PREFIX: Record<string, string> = {
  list_users: 'user', create_user: 'user', delete_user: 'user', update_user: 'user', list_roles: 'user', get_user: 'user', set_role: 'user',
  list_repos: 'gitea', create_repo: 'gitea', delete_repo: 'gitea', list_branches: 'gitea', list_commits: 'gitea', get_file: 'gitea', list_orgs: 'gitea',
  list_images: 'registry', list_tags: 'registry', delete_image: 'registry',
  promote_image: 'promotion', list_promotions: 'promotion', rollback_promotion: 'promotion',
}

export function ToolsTab() {
  const { data, isLoading, error } = useQuery({ queryKey: ['tools'], queryFn: ({ signal }) => getTools(signal), staleTime: 5 * 60_000 })
  const [active, setActive] = useState<ToolDef | null>(null)
  const grouped = useMemo(() => {
    const out: Record<string, ToolDef[]> = {}
    for (const t of data?.tools ?? []) {
      const cat = (t as any).category || CATEGORY_FROM_PREFIX[t.name] || 'other'
      ;(out[cat] ||= []).push(t)
    }
    return out
  }, [data])

  if (isLoading) return <div className="p-3 text-sm text-muted">Loading tools…</div>
  if (error) return <div className="p-3 text-sm text-err">Failed to load tools.</div>

  return (
    <div className="p-3">
      {Object.entries(grouped).map(([cat, list]) => (
        <div key={cat} className="mb-3">
          <div className="text-[10px] uppercase tracking-wider text-muted mb-1.5">{cat} · {list.length}</div>
          <div>
            {list.map((t) => (
              <button
                key={t.name}
                onClick={() => setActive(t)}
                className="w-full flex justify-between items-center text-sm font-mono py-1.5 hover:text-text text-left"
              >
                <span>{t.name}</span>
                <span className="text-[10px] uppercase tracking-wider text-faint border border-border bg-bg rounded px-1.5 py-0.5 font-sans">{cat}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      <ToolDrawer tool={active} onClose={() => setActive(null)} />
    </div>
  )
}
```

- [ ] **Step 2: Drawer**

```typescript
// chat-ui/web/src/features/tools/ToolDrawer.tsx
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import type { ToolDef } from '@/lib/schemas'

export function ToolDrawer({ tool, onClose }: { tool: ToolDef | null; onClose: () => void }) {
  return (
    <Dialog open={!!tool} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        {tool && (
          <>
            <DialogTitle className="font-mono">{tool.name}</DialogTitle>
            <p className="text-sm text-muted">{tool.description || '—'}</p>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted mb-1">JSON Schema</div>
              <pre className="bg-bg border border-border rounded p-3 text-xs font-mono whitespace-pre-wrap max-h-72 overflow-auto">
                {JSON.stringify(tool.inputSchema ?? {}, null, 2)}
              </pre>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Sanity**

Tools tab lists every tool grouped by category; clicking opens the schema dialog.

- [ ] **Step 4: Commit**

```bash
git add chat-ui/web/src/features/tools
git commit -m "chat-ui/web: Tools tab with grouped catalog + schema drawer"
```

---

### Task 18: Trace tab — session timeline

**Files:**
- Modify: `chat-ui/web/src/lib/store.ts` (add traces)
- Modify: `chat-ui/web/src/lib/chat.ts` (push traces)
- Modify: `chat-ui/web/src/features/trace/TraceTab.tsx`

- [ ] **Step 1: Add `traces` slice to the store**

In `store.ts`, add to `LabState`:

```typescript
export type TraceEntry = {
  id: string
  ts: number
  name: string
  ok: boolean
  durationMs?: number
  messageId: string
}

// in state:
traces: TraceEntry[]
appendTrace: (t: TraceEntry) => void
clearTraces: () => void
```

In the store create call, add:

```typescript
traces: [],
appendTrace: (t) => set((s) => ({ traces: [...s.traces, t] })),
clearTraces: () => set({ traces: [] }),
```

Update `clearMessages` to also clear traces:

```typescript
clearMessages: () => set({ messages: [], sessionTokens: 0, traces: [] }),
```

- [ ] **Step 2: Update `chat.ts` to push traces on response**

In `lib/chat.ts`, after the `state.patchMessage(pendingId, { ... })` call:

```typescript
for (const tc of res.tool_calls) {
  const ok = tc.result != null && !String(tc.result).startsWith('Error')
  state.appendTrace({
    id: `t${Date.now()}-${Math.random()}`,
    ts: Date.now(),
    name: tc.name,
    ok,
    messageId: pendingId,
  })
}
```

- [ ] **Step 3: Implement Trace tab**

```typescript
// chat-ui/web/src/features/trace/TraceTab.tsx
import { useLab } from '@/lib/store'

export function TraceTab() {
  const traces = useLab((s) => s.traces)
  if (traces.length === 0) return <div className="p-3 text-sm text-muted">No tool calls yet.</div>
  return (
    <div className="p-3 text-sm">
      {traces.map((t) => (
        <div key={t.id} className="grid grid-cols-[80px_1fr_auto] gap-2 py-1.5 border-b border-dashed border-border last:border-b-0 items-center">
          <span className="font-mono text-[10px] text-faint">{new Date(t.ts).toLocaleTimeString([], { hour12: false })}</span>
          <span className="font-mono text-text">{t.name}</span>
          <span className={t.ok ? 'text-ok text-xs' : 'text-err text-xs'}>{t.ok ? '✓' : '✗'}{t.durationMs ? ` ${t.durationMs}ms` : ''}</span>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Sanity**

Send a message that triggers a tool. Click Trace tab → row appears with timestamp + tool name + ✓.

- [ ] **Step 5: Commit**

```bash
git add chat-ui/web/src/lib/store.ts chat-ui/web/src/lib/chat.ts chat-ui/web/src/features/trace
git commit -m "chat-ui/web: Trace tab with session-wide tool-call timeline"
```

---

### Task 19: Compare tab — split chat against two providers

**Files:**
- Modify: `chat-ui/web/src/features/compare/CompareTab.tsx`

- [ ] **Step 1: Implement compare flow**

```typescript
// chat-ui/web/src/features/compare/CompareTab.tsx
import { useState } from 'react'
import { sendChatCompare } from '@/lib/api'

type Pane = { provider: string; model: string; halu: boolean; reply: string; busy: boolean; error?: string }
const init = (provider: string, model: string): Pane => ({ provider, model, halu: false, reply: '', busy: false })

export function CompareTab() {
  const [prompt, setPrompt] = useState('')
  const [left, setLeft] = useState<Pane>(init('ollama', 'llama3.1'))
  const [right, setRight] = useState<Pane>(init('anthropic', 'claude-sonnet-4-5-20250929'))

  async function run() {
    if (!prompt.trim()) return
    setLeft({ ...left, busy: true, reply: '', error: undefined })
    setRight({ ...right, busy: true, reply: '', error: undefined })
    try {
      const res: any = await sendChatCompare({
        prompt,
        left: { provider: left.provider, model: left.model, hallucination_mode: left.halu },
        right: { provider: right.provider, model: right.model, hallucination_mode: right.halu },
      })
      setLeft({ ...left, busy: false, reply: res?.left?.reply ?? '' })
      setRight({ ...right, busy: false, reply: res?.right?.reply ?? '' })
    } catch (e: any) {
      setLeft({ ...left, busy: false, error: e?.message })
      setRight({ ...right, busy: false, error: e?.message })
    }
  }

  return (
    <div className="p-3 text-sm">
      <div className="grid grid-cols-2 gap-2 mb-2">
        <PaneConfig label="Left" pane={left} onChange={setLeft} />
        <PaneConfig label="Right" pane={right} onChange={setRight} />
      </div>
      <textarea
        rows={2}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        className="w-full bg-bg border border-border rounded-md p-2 text-sm mb-2"
        placeholder="Ask both providers the same thing…"
      />
      <button onClick={run} className="bg-primary text-primary-fg rounded-md px-3 py-1.5 text-sm">Run both</button>
      <div className="grid grid-cols-1 gap-2 mt-3">
        <PaneOut label={`${left.provider} · ${left.model}`} pane={left} />
        <PaneOut label={`${right.provider} · ${right.model}`} pane={right} />
      </div>
    </div>
  )
}

function PaneConfig({ label, pane, onChange }: { label: string; pane: Pane; onChange: (p: Pane) => void }) {
  return (
    <div className="bg-surface-2 border border-border rounded-md p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted mb-1">{label}</div>
      <select value={pane.provider} onChange={(e) => onChange({ ...pane, provider: e.target.value })} className="w-full bg-bg border border-border rounded text-xs px-1 py-0.5 mb-1">
        {['ollama', 'openai', 'anthropic', 'google', 'pretend'].map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      <input value={pane.model} onChange={(e) => onChange({ ...pane, model: e.target.value })} className="w-full bg-bg border border-border rounded text-xs px-1 py-0.5 mb-1" />
      <label className="flex items-center gap-1 text-[10px] text-muted">
        <input type="checkbox" checked={pane.halu} onChange={(e) => onChange({ ...pane, halu: e.target.checked })} />
        ⚠ Flying blind
      </label>
    </div>
  )
}

function PaneOut({ label, pane }: { label: string; pane: Pane }) {
  return (
    <div className="bg-surface-2 border border-border rounded-md p-2 min-h-[80px]">
      <div className="text-[11px] font-semibold mb-1">{label}</div>
      {pane.busy ? <span className="text-muted italic">running…</span> : pane.error ? <span className="text-err">{pane.error}</span> : <pre className="whitespace-pre-wrap text-[12px]">{pane.reply}</pre>}
    </div>
  )
}
```

- [ ] **Step 2: Sanity**

Compare tab shows two stacked output panes; entering a prompt and clicking Run both fires `/api/chat-compare` and fills both.

- [ ] **Step 3: Commit**

```bash
git add chat-ui/web/src/features/compare
git commit -m "chat-ui/web: Compare tab (split chat over two providers)"
```

---

## Phase 7 — ⌘K + shortcuts + walkthrough + a11y

### Task 20: ⌘K command palette

**Files:**
- Create: `chat-ui/web/src/components/CmdK.tsx`
- Modify: `chat-ui/web/src/App.tsx` (mount)

- [ ] **Step 1: Implement CmdK**

```typescript
// chat-ui/web/src/components/CmdK.tsx
import { useEffect, useState } from 'react'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useLab } from '@/lib/store'
import { applyTheme } from '@/lib/theme'
import { useQuery } from '@tanstack/react-query'
import { getTools, setHallucinationMode } from '@/lib/api'

export function CmdK() {
  const open = useLab((s) => s.cmdkOpen)
  const setOpen = useLab((s) => s.setCmdkOpen)
  const setTab = useLab((s) => s.setInspectorTab)
  const clear = useLab((s) => s.clearMessages)
  const flyingBlind = useLab((s) => s.flyingBlind)
  const setFlying = useLab((s) => s.setFlyingBlind)
  const { data: tools } = useQuery({ queryKey: ['tools'], queryFn: ({ signal }) => getTools(signal), staleTime: 5 * 60_000 })

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(!open)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  function go(action: () => void) {
    return () => { action(); setOpen(false) }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0 max-w-xl overflow-hidden">
        <Command>
          <CommandInput placeholder="Search actions, tools, servers…" />
          <CommandList>
            <CommandEmpty>No matches.</CommandEmpty>
            <CommandGroup heading="Suggestions">
              <CommandItem onSelect={go(() => applyTheme('light'))}>Set theme: Light</CommandItem>
              <CommandItem onSelect={go(() => applyTheme('dark'))}>Set theme: Dark</CommandItem>
              <CommandItem onSelect={go(async () => { const next = !flyingBlind; setFlying(next); await setHallucinationMode(next) })}>
                Toggle Flying Blind ({flyingBlind ? 'on → off' : 'off → on'})
              </CommandItem>
              <CommandItem onSelect={go(clear)}>Clear chat</CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Navigation">
              <CommandItem onSelect={go(() => setTab('servers'))}>Focus inspector → Servers</CommandItem>
              <CommandItem onSelect={go(() => setTab('tools'))}>Focus inspector → Tools</CommandItem>
              <CommandItem onSelect={go(() => setTab('trace'))}>Focus inspector → Trace</CommandItem>
              <CommandItem onSelect={go(() => setTab('compare'))}>Focus inspector → Compare</CommandItem>
            </CommandGroup>
            {tools?.tools?.length ? (
              <>
                <CommandSeparator />
                <CommandGroup heading={`Tools (${tools.tools.length})`}>
                  {tools.tools.map((t) => (
                    <CommandItem key={t.name} value={`tool ${t.name} ${t.description}`} onSelect={go(() => setTab('tools'))}>
                      <span className="font-mono">{t.name}</span>
                      <span className="ml-2 text-xs text-muted truncate">{t.description}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            ) : null}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Mount in App**

```typescript
// chat-ui/web/src/App.tsx — add inside the root div
import { CmdK } from '@/components/CmdK'

// ... existing tree, plus:
<CmdK />
```

- [ ] **Step 3: Sanity**

Press `⌘K` (or `Ctrl+K` on Linux). Palette opens. Type "tools" → "Focus inspector → Tools" appears; selecting it switches the tab.

- [ ] **Step 4: Commit**

```bash
git add chat-ui/web/src/components/CmdK.tsx chat-ui/web/src/App.tsx
git commit -m "chat-ui/web: ⌘K command palette (suggestions, navigation, tools)"
```

---

### Task 21: Keyboard shortcuts (theme, density, clear, ?)

**Files:**
- Create: `chat-ui/web/src/lib/shortcuts.ts`, `chat-ui/web/src/components/Shortcuts.tsx`
- Modify: `chat-ui/web/src/App.tsx`

- [ ] **Step 1: Hook**

```typescript
// chat-ui/web/src/lib/shortcuts.ts
import { useEffect } from 'react'
import { useLab } from './store'
import { applyTheme, applyDensity, type Density } from './theme'
import { setHallucinationMode } from './api'

const STEPS: Density[] = ['compact', 'comfortable', 'large']

export function useShortcuts(setShortcutsOpen: (v: boolean) => void) {
  const clear = useLab((s) => s.clearMessages)
  const setFlying = useLab((s) => s.setFlyingBlind)
  const flying = useLab((s) => s.flyingBlind)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey
      // ⌘ J — toggle theme
      if (meta && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        const cur = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
        applyTheme(cur === 'dark' ? 'light' : 'dark')
        return
      }
      // ⇧⌘ H — Flying Blind
      if (meta && e.shiftKey && e.key.toLowerCase() === 'h') {
        e.preventDefault()
        const next = !flying
        setFlying(next)
        setHallucinationMode(next).catch(() => {})
        return
      }
      // ⌘ + / ⌘ − / ⌘ 0 — density
      if (meta && (e.key === '+' || e.key === '=')) {
        e.preventDefault()
        bump(+1)
        return
      }
      if (meta && e.key === '-') {
        e.preventDefault()
        bump(-1)
        return
      }
      if (meta && e.key === '0') {
        e.preventDefault()
        applyDensity('comfortable', 1)
        return
      }
      // ⇧⌘ ⌫ — clear chat
      if (meta && e.shiftKey && e.key === 'Backspace') {
        e.preventDefault()
        clear()
        return
      }
      // ? — shortcuts
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault()
        setShortcutsOpen(true)
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [clear, setFlying, flying, setShortcutsOpen])
}

function bump(direction: 1 | -1) {
  const cur = (document.documentElement.dataset.density as Density) || 'comfortable'
  const idx = STEPS.indexOf(cur)
  const next = STEPS[Math.max(0, Math.min(STEPS.length - 1, idx + direction))]
  const scale = next === 'compact' ? 0.85 : next === 'large' ? 1.18 : 1
  applyDensity(next, scale)
}
```

- [ ] **Step 2: Shortcuts cheatsheet dialog**

```typescript
// chat-ui/web/src/components/Shortcuts.tsx
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

const ROWS: [string, string][] = [
  ['⌘ K', 'Open command palette'],
  ['⌘ J', 'Toggle theme'],
  ['⇧⌘ H', 'Toggle Flying Blind'],
  ['⌘ + / ⌘ −', 'Density bump'],
  ['⌘ 0', 'Density reset'],
  ['⇧⌘ ⌫', 'Clear chat'],
  ['?', 'Show this'],
  ['Esc', 'Close popovers'],
]

export function Shortcuts({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle>Keyboard shortcuts</DialogTitle>
        <table className="w-full text-sm mt-2">
          <tbody>
            {ROWS.map(([k, v]) => (
              <tr key={k} className="border-b border-border last:border-b-0">
                <td className="py-1.5"><kbd className="font-mono text-xs bg-surface-2 border border-border border-b-2 rounded px-1.5">{k}</kbd></td>
                <td className="py-1.5 text-muted">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Wire into App**

```typescript
// chat-ui/web/src/App.tsx
import { useState } from 'react'
import { useShortcuts } from '@/lib/shortcuts'
import { Shortcuts } from '@/components/Shortcuts'

export default function App() {
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  useShortcuts(setShortcutsOpen)
  // ...existing return tree, add at end:
  return (
    <div className="h-screen flex flex-col bg-bg text-text">
      <Header />
      <div className="flex-1 flex min-h-0">
        <ChatPane />
        <Inspector />
      </div>
      <InputRow />
      <CmdK />
      <Shortcuts open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  )
}
```

Also wire the corner menu's "Keyboard shortcuts" item to call `setShortcutsOpen(true)`. Pass it down or use a small zustand slot — quickest fix is a zustand-managed `shortcutsOpen` flag (extend store the same way as `cmdkOpen`).

- [ ] **Step 4: Sanity**

Press `?` (when not focused on textarea) — shortcuts dialog opens. `⌘ J` flips theme. `⌘ +` / `⌘ −` step density.

- [ ] **Step 5: Commit**

```bash
git add chat-ui/web/src/lib/shortcuts.ts chat-ui/web/src/components/Shortcuts.tsx chat-ui/web/src/App.tsx
git commit -m "chat-ui/web: keyboard shortcuts + cheatsheet dialog"
```

---

### Task 22: Walkthrough overlay (first-run)

**Files:**
- Create: `chat-ui/web/src/components/Walkthrough.tsx`
- Modify: `chat-ui/web/src/App.tsx`, `chat-ui/web/src/components/CornerMenu.tsx`

- [ ] **Step 1: Lightweight overlay**

```typescript
// chat-ui/web/src/components/Walkthrough.tsx
import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

const STEPS = [
  { title: 'Welcome to the MCP DevOps Lab', body: 'A chat UI that drives a real Docker stack via MCP tools. Pick a provider in the chip below to start.' },
  { title: 'Watch tool calls happen', body: 'Each message can call tools like list_users or promote_image. Click a tool line to expand args + result.' },
  { title: 'The right rail is the lab', body: 'Servers shows live status. Tools is the schema catalog. Trace is the timeline. Compare runs two providers in parallel.' },
  { title: 'Keyboard-first', body: 'Press ⌘K anywhere to switch provider, jump to a tool, or change theme. Press ? to see all shortcuts.' },
]

const KEY = 'mcp-lab.walkthrough.seen.v1'

export function Walkthrough({ forceOpen, onClose }: { forceOpen?: boolean; onClose?: () => void }) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (forceOpen) { setOpen(true); setStep(0); return }
    if (!localStorage.getItem(KEY)) setOpen(true)
  }, [forceOpen])

  function close() {
    localStorage.setItem(KEY, '1')
    setOpen(false)
    onClose?.()
  }

  const cur = STEPS[step]
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close() }}>
      <DialogContent className="max-w-md">
        <DialogTitle>{cur.title}</DialogTitle>
        <p className="text-sm text-muted">{cur.body}</p>
        <div className="flex justify-between items-center mt-4">
          <span className="text-xs text-faint">{step + 1} / {STEPS.length}</span>
          <div className="flex gap-2">
            {step > 0 && <Button variant="outline" size="sm" onClick={() => setStep(step - 1)}>Back</Button>}
            {step < STEPS.length - 1 ? (
              <Button size="sm" onClick={() => setStep(step + 1)}>Next</Button>
            ) : (
              <Button size="sm" onClick={close}>Done</Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Mount in App + wire corner-menu trigger**

In `App.tsx` add `<Walkthrough />`. Add a state pair for force-opening (`useState<number>(0)` as a "kick"); pass via context or zustand. Simplest: extend zustand store with `walkthroughKick: number` and `kickWalkthrough: () => set((s) => ({ walkthroughKick: s.walkthroughKick + 1 }))`. The CornerMenu's "Walkthrough" button calls `kickWalkthrough()`. The Walkthrough component subscribes to `walkthroughKick` and re-opens whenever it increments.

- [ ] **Step 3: Sanity**

First load: walkthrough opens (4 steps). Click Done → `localStorage` flag set, never re-opens. Click corner ⋯ → Walkthrough → it opens again.

- [ ] **Step 4: Commit**

```bash
git add chat-ui/web/src/components/Walkthrough.tsx chat-ui/web/src/App.tsx chat-ui/web/src/lib/store.ts chat-ui/web/src/components/CornerMenu.tsx
git commit -m "chat-ui/web: first-run walkthrough overlay (4 steps) + corner menu trigger"
```

---

### Task 23: Hallucination warning band + error toasts + retry button

**Files:**
- Create: `chat-ui/web/src/components/FlyingBlindBanner.tsx`
- Modify: `chat-ui/web/src/components/ChatPane.tsx`, `chat-ui/web/src/lib/chat.ts`, `chat-ui/web/src/features/chat/MessageList.tsx`

- [ ] **Step 1: Banner**

```typescript
// chat-ui/web/src/components/FlyingBlindBanner.tsx
import { useLab } from '@/lib/store'

export function FlyingBlindBanner() {
  const on = useLab((s) => s.flyingBlind)
  if (!on) return null
  return (
    <div className="bg-warn/15 text-warn border-b border-warn/40 px-4 py-2 text-sm font-semibold text-center">
      ⚠ Flying Blind — no tools, no probes, no grounding. The model will fabricate.
    </div>
  )
}
```

Mount above `MessageList` in `ChatPane.tsx`:

```typescript
import { FlyingBlindBanner } from '@/components/FlyingBlindBanner'

export function ChatPane() {
  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <FlyingBlindBanner />
      <MessageList />
    </div>
  )
}
```

- [ ] **Step 2: Toasts on error in `chat.ts`**

Add at the top:

```typescript
import { toast } from '@/components/ui/use-toast'
```

In the catch-non-abort branch:

```typescript
toast({ title: "Couldn't reach the lab", description: e?.message, variant: 'destructive' })
```

For 401/403 detect (`e instanceof ApiError && (e.status === 401 || e.status === 403)`):

```typescript
toast({ title: 'API key looks wrong', description: 'Check the chip popover below.', variant: 'destructive' })
```

Open the provider popover automatically by setting a zustand flag (e.g. `providerPopoverOpen`) — or skip the auto-open in v1 and just toast.

- [ ] **Step 3: Retry button on error message**

In `MessageList.tsx`, when a message has `status === 'error'`, render a small "Retry" button alongside the error text. Wire it to:

```typescript
import { send } from '@/lib/chat'
// ...find the user message immediately preceding the failed assistant (m.id - 1)
// and call send(prev.content).
```

The simplest implementation: walk back from the failed assistant message in the messages array to find the most recent user message and call `send(prev.content)`.

- [ ] **Step 4: Commit**

```bash
git add chat-ui/web/src/components/FlyingBlindBanner.tsx chat-ui/web/src/components/ChatPane.tsx chat-ui/web/src/lib/chat.ts chat-ui/web/src/features/chat/MessageList.tsx
git commit -m "chat-ui/web: Flying Blind banner + error toasts + inline retry"
```

---

### Task 24: a11y (axe-core in dev) + focus rings

**Files:**
- Modify: `chat-ui/web/src/main.tsx`
- Modify: `chat-ui/web/src/styles/globals.css`

- [ ] **Step 1: Wire axe-core only in dev**

```typescript
// chat-ui/web/src/main.tsx — at the top before bootstrap
if (import.meta.env.DEV) {
  import('@axe-core/react').then(({ default: axe }) => {
    import('react-dom').then((ReactDOM) => {
      axe(React, ReactDOM, 1000)
    })
  })
}
```

- [ ] **Step 2: Visible focus ring tokens**

Append to `globals.css`:

```css
:where(button, a, [role='button'], input, textarea, select):focus-visible {
  outline: 2px solid rgb(var(--text));
  outline-offset: 2px;
}
```

- [ ] **Step 3: Verify**

Open dev tools → Console. Tab through the UI; every focusable shows a ring. axe-core logs no violations on the empty state.

- [ ] **Step 4: Commit**

```bash
git add chat-ui/web/src/main.tsx chat-ui/web/src/styles/globals.css
git commit -m "chat-ui/web: axe-core in dev + visible focus rings"
```

---

## Phase 8 — Cutover

### Task 25: Multi-stage Dockerfile

**Files:**
- Modify: `chat-ui/Dockerfile`

- [ ] **Step 1: Replace the Dockerfile**

```dockerfile
# chat-ui/Dockerfile
FROM node:22-alpine AS web-builder
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM python:3.12-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl gnupg \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
    && chmod a+r /etc/apt/keyrings/docker.asc \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends docker-ce-cli docker-compose-plugin \
    && apt-get purge -y gnupg && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app/ ./app/
COPY --from=web-builder /web/dist ./app/static

EXPOSE 3001
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "3001"]
```

Note: Vite's default outDir is `dist`; we set `outDir: '../app/static'` in the dev workspace, but inside the Docker build the working dir is `/web` and the output should be `/web/dist` for the COPY step. **Update `vite.config.ts`** to detect Docker context — simpler approach: set the outDir to `dist` and have local `npm run build` copy to `../app/static` via a small script. Easiest:

```typescript
// chat-ui/web/vite.config.ts — change outDir
build: {
  outDir: process.env.VITE_DOCKER ? 'dist' : '../app/static',
  emptyOutDir: true,
  assetsDir: 'assets',
},
```

In the Dockerfile: `RUN VITE_DOCKER=1 npm run build`.

- [ ] **Step 2: Build the image**

```bash
cd /Users/noelorona/Desktop/repos/mcp-lab
docker compose build chat-ui
```

Expected: builds successfully through both stages, image size jumps by ~50–80MB.

- [ ] **Step 3: Run + smoke test**

```bash
docker compose up -d chat-ui
curl -s http://localhost:3001/ | head -c 200
```

Expected: HTML response with `<div id="root">` and a `/static/assets/...` script tag.

- [ ] **Step 4: Commit**

```bash
git add chat-ui/Dockerfile chat-ui/web/vite.config.ts
git commit -m "chat-ui: multi-stage Dockerfile (node build → python runtime)"
```

---

### Task 26: Diff M9-WIP, port any still-wanted behavior, delete old static files

**Files:**
- Delete: `chat-ui/app/static/app.js`, `style.css`, `index.html`, `tool_verify.js` (the originals)

- [ ] **Step 1: Diff the M9 WIP against `main`**

```bash
git log --oneline -- chat-ui/app/static/ | head -20
git diff main HEAD -- chat-ui/app/static/app.js | head -200
git diff main HEAD -- chat-ui/app/static/style.css | head -200
```

(The current branch is `main` already and the diffs are uncommitted/M9 — adapt based on actual state.)

- [ ] **Step 2: Read each modified file in full and list every behavior**

For `app.js`: enumerate features (provider switching, polling, hallucination toggle, compare, dashboard, walkthrough, schema modal, token counter, theme persistence, etc.). For each, confirm whether the new web/ implementation already covers it. Anything not yet covered → file an inline FIXME and address before continuing. (Expected list: empty, since the spec inventory was exhaustive — but verify, don't trust.)

- [ ] **Step 3: Run a real `docker compose up`, exercise every acceptance criterion in the spec**

```bash
docker compose up -d
open http://localhost:3001
```

For each of the 12 acceptance criteria in `docs/superpowers/specs/2026-05-01-chat-ui-redesign-design.md`, exercise it. Note pass/fail.

- [ ] **Step 4: Stage the deletion of the old static files**

The new Vite build already overwrites `chat-ui/app/static/index.html` and emits `assets/`. The old `app.js`, `style.css`, `tool_verify.js` should be removed from git tracking — Vite emptied the directory at build time but the files may still be tracked. Run:

```bash
cd /Users/noelorona/Desktop/repos/mcp-lab
git rm chat-ui/app/static/app.js chat-ui/app/static/style.css chat-ui/app/static/tool_verify.js 2>/dev/null
# index.html is overwritten by the build — let it stand.
```

(If running outside Docker: also `git rm` any stray `index.html` from the old vanilla version; the next `npm run build` will recreate it.)

- [ ] **Step 5: Verify the build output is what's served**

```bash
cd chat-ui/web && npm run build
ls ../app/static/
```

Expected: only `index.html` and `assets/`. No `app.js`, `style.css`, `tool_verify.js`.

- [ ] **Step 6: Commit the cutover**

```bash
git add chat-ui/app/static
git commit -m "chat-ui: cutover — delete vanilla static files; web/ build is now the UI"
```

---

### Task 27: Update Cypress selectors

**Files:**
- Modify: `chat-ui/cypress/e2e/*.cy.{js,ts}` (every test)

- [ ] **Step 1: Inventory existing Cypress tests**

```bash
ls chat-ui/cypress/e2e/
```

- [ ] **Step 2: For each test, replace selectors that no longer match**

The shape of selectors that changed:
- `#provider-select`, `#model-input`, `#api-key-input` → now inside the provider chip popover. Update tests to click the chip first, then interact within the popover.
- `#mcp-strip` → removed; use Inspector Servers tab instead (`[data-testid="inspector"] [role="tab"][value="servers"]`).
- `#dashboard-modal` etc. → modals removed; switch to the Servers tab.
- `#user-input` → `<textarea>` inside the input row. Add `data-testid="chat-input"` to InputRow's textarea and use it.
- `#send-btn` → add `data-testid="chat-send"`.
- `#hallucination-toggle` → now inside corner menu Switch. Add `data-testid="flying-blind-switch"`.

Add minimal `data-testid` attributes in `web/src/components/InputRow.tsx`, `Inspector.tsx`, `CornerMenu.tsx` to give Cypress stable handles. Re-run tests.

- [ ] **Step 3: Add new e2e tests for new affordances**

Create `chat-ui/cypress/e2e/redesign.cy.ts`:

```typescript
describe('chat-ui redesign', () => {
  beforeEach(() => { cy.visit('/') })

  it('opens corner menu and cycles density', () => {
    cy.get('[data-testid="corner-menu-trigger"]').click()
    cy.contains('button', 'Large').click()
    cy.get('html').should('have.attr', 'data-density', 'large')
  })

  it('opens command palette with ⌘K', () => {
    cy.get('body').type('{cmd}k')
    cy.contains('Set theme: Light').should('be.visible')
  })

  it('switches inspector tab', () => {
    cy.contains('[role="tab"]', 'Tools').click()
    cy.contains(/^User · /).should('be.visible')
  })
})
```

- [ ] **Step 4: Run Cypress**

```bash
cd chat-ui && npx cypress run
```

Expected: all tests pass. Fix anything that doesn't.

- [ ] **Step 5: Commit**

```bash
git add chat-ui/cypress chat-ui/web/src
git commit -m "chat-ui: update cypress selectors for new component DOM + redesign e2e"
```

---

### Task 28: Final acceptance — exercise the 12 spec criteria end-to-end

**Files:** none

- [ ] **Step 1: Run the full stack**

```bash
cd /Users/noelorona/Desktop/repos/mcp-lab
docker compose up -d
```

- [ ] **Step 2: Walk every criterion in `docs/superpowers/specs/2026-05-01-chat-ui-redesign-design.md` § Acceptance Criteria**

For each numbered item (1 through 12): perform the action, confirm pass. If anything fails, file an issue task in the plan and resolve before declaring done. The criteria cover: load + dark mode + Comfortable density · provider config · send + tool-call render · Servers verify · Tools schema · Trace · density change · light theme · ⌘K search "promote" · ⌘K search "compare" · Flying Blind banner · pytest + cypress.

- [ ] **Step 3: Run backend pytest**

```bash
cd chat-ui && pytest
```

Expected: all pass (backend untouched).

- [ ] **Step 4: Run frontend Vitest**

```bash
cd chat-ui/web && npm test
```

Expected: all pass.

- [ ] **Step 5: Run Cypress**

```bash
cd chat-ui && npx cypress run
```

Expected: all pass.

- [ ] **Step 6: Final commit (if any tweaks were made during acceptance)**

```bash
git add -A
git commit -m "chat-ui: redesign v1 ships — 12/12 acceptance criteria green"
```

---

## Self-Review

**Spec coverage check:** every spec section maps to at least one task —

| Spec section | Tasks |
| --- | --- |
| Tech stack | 1, 2, 3, 4 |
| Repo layout | 1 |
| Two-pane IA | 9, 15 |
| Header (brand + corner menu) | 9, 10 |
| Input row (provider chip) | 11, 12 |
| Inspector tabs | 15, 16, 17, 18, 19 |
| Visual language + tokens | 2 |
| Density control | 2 (CSS), 10 (UI) |
| Chat message variants | 13, 14 |
| ⌘K palette | 20 |
| Keyboard shortcuts + cheatsheet | 21 |
| Walkthrough | 22 |
| Data flow + chat send/stop | 12 |
| Error handling + Flying Blind banner | 23 |
| Persistence (localStorage) | 7, 11 |
| Build + dev loop | 1 |
| Docker multi-stage | 25 |
| Cutover (delete old files) | 26 |
| Testing — Vitest | 5, 6, 8, 10, 11, 13 |
| Testing — Cypress | 27 |
| a11y | 24 |
| Acceptance run | 28 |

**Placeholder scan:** No "TBD"/"TODO" left. Every code block contains the actual code an engineer types.

**Type consistency:** `LabState`, `ChatMessageView`, `InspectorTab`, `Density`, `Theme` are defined once and used consistently across tasks. `ToolCall` and `ChatResponse` are imported from `lib/schemas`, never re-defined. Function names (`applyTheme`, `applyDensity`, `setProvider`, `setHallucinationMode`, `sendChat`, `probeServer`, `appendChatHistory`, `clearChatHistory`) match across tasks.

**One gap fixed inline:** Task 22 (Walkthrough) references a `kickWalkthrough` zustand action; that means Task 22 also extends the store. Note added in Task 22 Step 2 and the commit list.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-01-chat-ui-redesign.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
