import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { useLab } from '@/lib/store'
import { LESSONS, PHASE_COUNT } from './lessons'
import { IntroCard } from './IntroCard'
import { HallucinateCard } from './HallucinateCard'
import { EnableCard } from './EnableCard'
import { VerifyCard } from './VerifyCard'

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

  const next = () => setStep(Math.min(step + 1, PHASE_COUNT - 1))

  let card: ReactNode
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

  // Platform-aware modifier label. The existing CmdK binding already accepts
  // both metaKey and ctrlKey, so the *binding* works on every OS — only the
  // label changes.
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
  const modKey = isMac ? '⌘K' : 'Ctrl+K'

  return (
    <div
      data-testid="workshop-dock"
      className="fixed bottom-20 right-4 w-96 z-30 bg-surface border border-border rounded-lg shadow-lg p-4 text-sm"
    >
      <div className="text-xs text-muted mb-2 flex items-center justify-between gap-2">
        <span>Workshop · step {step + 1} of {PHASE_COUNT}</span>
        <span className="flex items-center gap-1">
          <button
            type="button"
            className="px-1.5 py-0.5 rounded border border-border bg-bg text-muted hover:text-text disabled:opacity-40"
            onClick={() => setStep(Math.max(step - 1, 0))}
            disabled={step === 0}
            aria-label="Previous step"
            data-testid="workshop-back"
          >
            ← back
          </button>
          <button
            type="button"
            className="px-1.5 py-0.5 rounded border border-border bg-bg text-muted hover:text-text disabled:opacity-40"
            onClick={() => setStep(Math.min(step + 1, PHASE_COUNT - 1))}
            disabled={step >= PHASE_COUNT - 1}
            aria-label="Next step"
            data-testid="workshop-forward"
          >
            forward →
          </button>
        </span>
      </div>
      {card}
      <div className="mt-3 pt-2 border-t border-border text-[10px] text-faint text-right">
        Stuck? Press <kbd className="font-mono">{modKey}</kbd> for workshop commands.
      </div>
    </div>
  )
}
