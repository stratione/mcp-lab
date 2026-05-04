// Inspector tab that hosts the walkthrough. The walkthrough lives here
// permanently — there's no separate floating panel anymore — so attendees
// can find it next to Try and stay in one place while moving through the
// SDLC tour.

import { WorkshopBody } from '@/components/workshop/Workshop'
import { useLab } from '@/lib/store'

export function WalkthroughTab() {
  const mode = useLab((s) => s.workshopMode)
  const setMode = useLab((s) => s.setWorkshopMode)

  if (!mode) {
    return (
      <div className="p-4 text-sm space-y-3">
        <h3 className="font-semibold text-text">Walkthrough</h3>
        <p className="text-muted">
          The 35-step SDLC walkthrough isn't running. Start it and the tour
          will render here — every step lives next to your existing Try /
          Tools / Servers tabs so you can flip between context without
          losing your place.
        </p>
        <button
          type="button"
          className="px-3 py-1.5 text-xs rounded border border-border bg-surface-2 text-text hover:bg-bg"
          onClick={() => setMode(true)}
          data-testid="walkthrough-tab-start"
        >
          Start walkthrough
        </button>
      </div>
    )
  }

  return (
    <div className="p-3" data-testid="workshop-dock">
      <WorkshopBody />
    </div>
  )
}
