import { useEffect, useState } from 'react'
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
const COLLAPSED_KEY = 'mcp-lab.workshop.collapsed.v1'

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
 * Pinned, non-modal floating panel. No overlay, no focus trap, no drag —
 * the chat input below stays fully usable while the walkthrough is up. A
 * collapse toggle shrinks the panel to a small status pill ("Step N/35")
 * for maximum chat real estate; users click to expand again.
 */
function WorkshopFloating() {
  const [collapsed, setCollapsed] = useState<boolean>(
    () => window.localStorage.getItem(COLLAPSED_KEY) === '1',
  )
  useEffect(() => {
    window.localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0')
  }, [collapsed])

  if (collapsed) return <CollapsedPill onExpand={() => setCollapsed(false)} />
  return <ExpandedPanel onCollapse={() => setCollapsed(true)} />
}

function CollapsedPill({ onExpand }: { onExpand: () => void }) {
  const step = useLab((s) => s.workshopStep)
  const safeIndex = Math.min(Math.max(step, 0), STEPS.length - 1)
  const phase = phaseFor(safeIndex)
  return (
    <button
      type="button"
      onClick={onExpand}
      title={`Click to expand the walkthrough (${phase.title})`}
      data-testid="workshop-pill"
      className="fixed bottom-20 right-4 z-30 px-3 py-1.5 rounded-full bg-surface border border-border shadow-md text-xs text-text hover:bg-surface-2 flex items-center gap-2"
    >
      <span className="text-faint">▴ Walkthrough</span>
      <span className="font-mono text-muted">{safeIndex + 1}/{PHASE_COUNT}</span>
    </button>
  )
}

function ExpandedPanel({ onCollapse }: { onCollapse: () => void }) {
  return (
    <div
      className="fixed bottom-20 right-4 z-30 w-96 max-h-[70vh] bg-surface border border-border rounded-lg shadow-xl text-sm flex flex-col overflow-hidden"
      data-testid="workshop-dock"
      role="region"
      aria-label="Workshop walkthrough"
    >
      <PanelHeader onCollapse={onCollapse} />
      <div className="overflow-y-auto p-4">
        <WorkshopBody />
      </div>
    </div>
  )
}

function PanelHeader({ onCollapse }: { onCollapse: () => void }) {
  const setMode = useLab((s) => s.setWorkshopMode)
  const setLayout = useLab((s) => s.setWalkthroughLayout)
  const setTab = useLab((s) => s.setInspectorTab)
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-border bg-surface-2">
      <span className="text-[10px] text-faint tracking-wider uppercase">
        Walkthrough
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted hover:text-text"
          onClick={onCollapse}
          title="Collapse to a small pill so the chat has more room"
          aria-label="Collapse walkthrough"
          data-testid="workshop-collapse"
        >
          —
        </button>
        <button
          type="button"
          className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted hover:text-text"
          onClick={() => {
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
          onClick={() => setMode(false)}
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
