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
