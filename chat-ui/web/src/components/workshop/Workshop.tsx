import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useLab } from '@/lib/store'
import { STEPS, PHASE_COUNT, phaseFor } from './lessons'
import { IntroCard } from './IntroCard'
import { HallucinateCard } from './HallucinateCard'
import { EnableCard } from './EnableCard'
import { VerifyCard } from './VerifyCard'
import { CapstoneVerifyCard } from './CapstoneVerifyCard'
import { WrapCard } from './WrapCard'
import { ToolReliabilityHint } from './ToolReliabilityHint'

const STEP_KEY = 'mcp-lab.workshop.step.v1'
const POS_KEY = 'mcp-lab.workshop.floating.pos.v1'
const PANEL_W = 384  // 24rem — matches Tailwind w-96
const PANEL_H_MAX = 600  // soft cap so the panel never overruns viewport

type Pos = { x: number; y: number }

/**
 * Workshop dispatcher. Renders the floating panel when
 * walkthroughLayout === 'floating' and workshopMode is on. Returns null
 * for the inspector layout — that path renders <WorkshopBody /> inside
 * the Inspector's Walkthrough tab instead.
 */
export function Workshop() {
  const mode = useLab((s) => s.workshopMode)
  const setMode = useLab((s) => s.setWorkshopMode)
  const setStep = useLab((s) => s.setWorkshopStep)
  const layout = useLab((s) => s.walkthroughLayout)

  // One-time mount: detect ?workshop=1 and restore persisted step.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('workshop') === '1') {
      setMode(true)
      const saved = parseInt(localStorage.getItem(STEP_KEY) ?? '0', 10)
      setStep(Number.isFinite(saved) ? saved : 0)
    }
  }, [setMode, setStep])

  if (!mode || layout !== 'floating') return null
  return <WorkshopFloating />
}

/**
 * Draggable, non-modal floating panel. No overlay, no focus trap — the
 * chat input below stays fully usable while the walkthrough is up.
 */
function WorkshopFloating() {
  const [pos, setPos] = useState<Pos>(() => loadPos())
  const dragOffset = useRef<{ dx: number; dy: number } | null>(null)

  // Persist position whenever it changes.
  useEffect(() => {
    window.localStorage.setItem(POS_KEY, JSON.stringify(pos))
  }, [pos])

  // Re-clamp into the viewport when the window resizes — otherwise dragging
  // the browser narrower can leave the panel offscreen.
  useEffect(() => {
    const onResize = () => setPos(clampPos)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  function startDrag(e: React.MouseEvent) {
    // Only the drag handle should initiate moves. Clicks on buttons /
    // inputs inside the panel must not steal them.
    e.preventDefault()
    dragOffset.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
    document.body.style.userSelect = 'none'
    function move(ev: MouseEvent) {
      if (!dragOffset.current) return
      setPos(clampPos({
        x: ev.clientX - dragOffset.current.dx,
        y: ev.clientY - dragOffset.current.dy,
      }))
    }
    function up() {
      dragOffset.current = null
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  return (
    <div
      style={{ left: pos.x, top: pos.y, width: PANEL_W, maxHeight: PANEL_H_MAX }}
      className="fixed z-30 bg-surface border border-border rounded-lg shadow-xl text-sm flex flex-col overflow-hidden"
      data-testid="workshop-dock"
      role="dialog"
      aria-label="Workshop walkthrough"
    >
      <DragHeader onMouseDown={startDrag} />
      <div className="overflow-y-auto p-4">
        <WorkshopBody />
      </div>
    </div>
  )
}

function DragHeader({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  const setMode = useLab((s) => s.setWorkshopMode)
  const setLayout = useLab((s) => s.setWalkthroughLayout)
  const setTab = useLab((s) => s.setInspectorTab)
  return (
    <div
      onMouseDown={onMouseDown}
      className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-border bg-surface-2 cursor-move select-none"
      data-testid="workshop-drag-handle"
      title="Drag to move"
    >
      <span className="text-[10px] text-faint tracking-wider uppercase">
        ⋮⋮ Walkthrough
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted hover:text-text"
          onClick={(e) => {
            // stopPropagation so the header's onMouseDown doesn't start a
            // drag on the same click that toggles the layout.
            e.stopPropagation()
            setLayout('inspector')
            setTab('walkthrough')
          }}
          title="Dock the walkthrough into the right-hand inspector instead"
          data-testid="workshop-dock-to-inspector"
        >
          → dock
        </button>
        <button
          type="button"
          className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted hover:text-text"
          onClick={(e) => {
            e.stopPropagation()
            setMode(false)
          }}
          title="Close the walkthrough"
          aria-label="Close walkthrough"
          data-testid="workshop-close"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

/**
 * The walkthrough body, with no chrome. Reused by the floating panel and
 * the Inspector's Walkthrough tab so both layouts render identical content.
 */
export function WorkshopBody() {
  const step = useLab((s) => s.workshopStep)
  const setStep = useLab((s) => s.setWorkshopStep)
  const mode = useLab((s) => s.workshopMode)
  const clearMessages = useLab((s) => s.clearMessages)

  // Persist step changes. Same key whether we're floating or in the inspector
  // — the content is identical, only the chrome differs.
  useEffect(() => {
    if (mode) localStorage.setItem(STEP_KEY, String(step))
  }, [mode, step])

  const safeIndex = Math.min(Math.max(step, 0), STEPS.length - 1)
  const cur = STEPS[safeIndex]
  const phase = phaseFor(safeIndex)
  const card = renderCard(cur)

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
  const modKey = isMac ? '⌘K' : 'Ctrl+K'

  return (
    <div className="space-y-3" data-testid="workshop-body">
      <div className="text-xs text-muted flex items-center justify-between gap-2">
        <span>{phase.title} · step {safeIndex + 1} of {PHASE_COUNT}</span>
        <span className="text-[10px] text-faint italic truncate">{phase.blurb}</span>
      </div>
      <ToolReliabilityHint />
      {card}
      <div className="mt-3 pt-2 border-t border-border flex items-center justify-between gap-2">
        <button
          type="button"
          className="px-2.5 py-1 text-xs rounded border border-border bg-bg text-muted hover:text-text disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={() => setStep(Math.max(safeIndex - 1, 0))}
          disabled={safeIndex === 0}
          aria-label="Previous step"
          data-testid="workshop-back"
        >
          ← back
        </button>
        <span className="text-[10px] text-faint">
          Stuck? Press <kbd className="font-mono">{modKey}</kbd> for commands.
        </span>
        <button
          type="button"
          className="px-2.5 py-1 text-xs rounded border border-border bg-bg text-text hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={() => setStep(Math.min(safeIndex + 1, PHASE_COUNT - 1))}
          disabled={safeIndex >= PHASE_COUNT - 1}
          aria-label="Next step"
          data-testid="workshop-forward"
        >
          forward →
        </button>
      </div>
      <div className="mt-2 text-right">
        <button
          type="button"
          className="text-[10px] text-faint hover:text-text underline-offset-2 hover:underline"
          onClick={() => {
            if (window.confirm('Clear the chat history? Your workshop step is preserved.')) {
              clearMessages()
            }
          }}
          data-testid="workshop-clear-chat"
          title="Resets the conversation that's sent to the LLM. Helpful if replies get sloppy after a long session."
        >
          Clear chat history
        </button>
      </div>
    </div>
  )
}

function renderCard(s: (typeof STEPS)[number]): ReactNode {
  switch (s.kind) {
    case 'intro':
      return <IntroCard />
    case 'cold-open':
      return (
        <HallucinateCard
          pass="cold-open"
          mcpLabel="No MCP servers running"
          prompt={s.prompt}
        />
      )
    case 'enable':
      return <EnableCard mcp={s.mcp} />
    case 'exercise':
      return (
        <HallucinateCard
          pass="exercise"
          heading={s.heading}
          mcpLabel=""
          prompt={s.prompt}
          tool={s.tool}
          teach={s.teach}
        />
      )
    case 'verify':
      return (
        <VerifyCard
          mcp={s.mcp}
          prompt={s.prompt}
          probe={s.probe}
          teach={s.teach}
        />
      )
    case 'capstone-verify':
      return <CapstoneVerifyCard />
    case 'wrap':
      return <WrapCard />
  }
}

// ─── pos helpers ──────────────────────────────────────────────────────────

function loadPos(): Pos {
  if (typeof window === 'undefined') return defaultPos()
  try {
    const raw = window.localStorage.getItem(POS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') {
        return clampPos(parsed)
      }
    }
  } catch {
    /* fall through */
  }
  return defaultPos()
}

function defaultPos(): Pos {
  // Bottom-right by default — same place the old dock lived, so muscle
  // memory survives the migration.
  if (typeof window === 'undefined') return { x: 0, y: 0 }
  return clampPos({
    x: window.innerWidth - PANEL_W - 16,
    y: window.innerHeight - PANEL_H_MAX - 80,
  })
}

function clampPos(p: Pos): Pos {
  if (typeof window === 'undefined') return p
  const maxX = Math.max(0, window.innerWidth - PANEL_W - 4)
  const maxY = Math.max(0, window.innerHeight - 80)
  return {
    x: Math.min(Math.max(0, p.x), maxX),
    y: Math.min(Math.max(0, p.y), maxY),
  }
}
