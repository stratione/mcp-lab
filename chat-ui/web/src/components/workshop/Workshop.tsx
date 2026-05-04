import { useEffect } from 'react'
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

/**
 * URL deep-link handler. The walkthrough body itself is rendered inside
 * the Inspector's "Walkthrough" tab (next to Try) — there is no floating
 * panel anymore. This component just watches for ?workshop=1 and flips
 * the workshop into "running" mode + selects the walkthrough tab on first
 * mount, then returns null. Mounted once at the App level.
 */
export function Workshop() {
  const setMode = useLab((s) => s.setWorkshopMode)
  const setStep = useLab((s) => s.setWorkshopStep)
  const setTab = useLab((s) => s.setInspectorTab)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('workshop') === '1') {
      setMode(true)
      setTab('walkthrough')
      const saved = parseInt(localStorage.getItem(STEP_KEY) ?? '0', 10)
      setStep(Number.isFinite(saved) ? saved : 0)
    }
  }, [setMode, setStep, setTab])

  return null
}

/**
 * The walkthrough body — chrome-less, rendered inside the Inspector's
 * Walkthrough tab. Persists step changes whenever workshop is active.
 */
export function WorkshopBody() {
  const step = useLab((s) => s.workshopStep)
  const setStep = useLab((s) => s.setWorkshopStep)
  const mode = useLab((s) => s.workshopMode)
  const clearMessages = useLab((s) => s.clearMessages)

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
