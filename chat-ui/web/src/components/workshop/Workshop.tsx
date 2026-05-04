import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { useLab } from '@/lib/store'
import { LESSONS, PHASE_COUNT } from './lessons'
import { IntroCard } from './IntroCard'
import { HallucinateCard } from './HallucinateCard'
import { EnableCard } from './EnableCard'
import { VerifyCard } from './VerifyCard'
import { CapstoneVerifyCard } from './CapstoneVerifyCard'
import { WrapCard } from './WrapCard'
import { ToolReliabilityHint } from './ToolReliabilityHint'

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

  let card: ReactNode
  if (step === 0) {
    card = <IntroCard />
  } else if (step === 1) {
    card = (
      <HallucinateCard
        pass="cold-open"
        mcpLabel="No MCP servers running"
        prompt="List all users in the system."
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
        />
      )
    } else if (sub === 1) {
      card = <EnableCard mcp={lesson.mcp} />
    } else {
      card = (
        <VerifyCard
          mcp={lesson.mcp}
          prompt={lesson.prompt}
          probe={lesson.probe}
          teach={lesson.teach}
        />
      )
    }
  } else if (step === PHASE_COUNT - 3) {
    card = (
      <HallucinateCard
        pass="pre-enable"
        mcpLabel="Capstone — chain everything"
        prompt="Build the hello-app from sample-app, scan it, promote it to production, and deploy it."
      />
    )
  } else if (step === PHASE_COUNT - 2) {
    // New: capstone payoff — probe the deployed app on localhost:9080.
    card = <CapstoneVerifyCard />
  } else {
    // step === PHASE_COUNT - 1 — wrap (real summary now, not the stale Intro).
    card = <WrapCard />
  }

  // Platform-aware modifier label. The existing CmdK binding already accepts
  // both metaKey and ctrlKey, so the *binding* works on every OS — only the
  // label changes.
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
  const modKey = isMac ? '⌘K' : 'Ctrl+K'

  const clearMessages = useLab((s) => s.clearMessages)

  return (
    <div
      data-testid="workshop-dock"
      className="fixed bottom-20 right-4 w-96 z-30 bg-surface border border-border rounded-lg shadow-lg p-4 text-sm"
    >
      <div className="text-xs text-muted mb-2 flex items-center justify-between gap-2">
        <span>Workshop · step {step + 1} of {PHASE_COUNT}</span>
        <button
          type="button"
          className="px-1.5 py-0.5 rounded border border-border bg-bg text-muted hover:text-text"
          onClick={() => setMode(false)}
          aria-label="Close workshop"
          data-testid="workshop-close"
          title="Close workshop (your progress is saved — re-open with ?workshop=1)"
        >
          ✕
        </button>
      </div>
      <ToolReliabilityHint />
      {card}
      <div className="mt-3 pt-2 border-t border-border flex items-center justify-between gap-2">
        <button
          type="button"
          className="px-2.5 py-1 text-xs rounded border border-border bg-bg text-muted hover:text-text disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={() => setStep(Math.max(step - 1, 0))}
          disabled={step === 0}
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
          onClick={() => setStep(Math.min(step + 1, PHASE_COUNT - 1))}
          disabled={step >= PHASE_COUNT - 1}
          aria-label="Next step"
          data-testid="workshop-forward"
        >
          forward →
        </button>
      </div>
      {/* Clear-chat affordance: long histories degrade small models around the
          26K-token mark; clearing keeps the user on the current step but
          starts the LLM context fresh. Subtle so it doesn't compete with the
          back/forward buttons, but always available. */}
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
