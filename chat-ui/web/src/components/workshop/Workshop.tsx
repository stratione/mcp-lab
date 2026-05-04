import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { useLab } from '@/lib/store'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { STEPS, PHASE_COUNT, phaseFor } from './lessons'
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

  const safeIndex = Math.min(Math.max(step, 0), STEPS.length - 1)
  const cur = STEPS[safeIndex]
  const phase = phaseFor(safeIndex)

  const card: ReactNode = renderCard(cur)

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
  const modKey = isMac ? '⌘K' : 'Ctrl+K'

  const clearMessages = useLab((s) => s.clearMessages)

  return (
    <Dialog open={mode} onOpenChange={setMode}>
      <DialogContent
        data-testid="workshop-dock"
        className="max-w-md text-sm"
      >
        <DialogHeader>
          <DialogTitle className="text-xs font-normal text-muted flex items-center justify-between gap-2">
            <span>
              {phase.title} · step {safeIndex + 1} of {PHASE_COUNT}
            </span>
            <span className="text-[10px] text-faint italic">{phase.blurb}</span>
          </DialogTitle>
        </DialogHeader>
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
      </DialogContent>
    </Dialog>
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
