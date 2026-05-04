// Inspector tab that hosts the walkthrough when walkthroughLayout ===
// 'inspector'. Reuses <WorkshopBody /> so the floating panel and the
// docked tab render byte-identical content. When the walkthrough is in
// floating mode (or off entirely), this tab shows a small placeholder
// pointing the user back to whichever surface is active.

import { WorkshopBody } from '@/components/workshop/Workshop'
import { useLab } from '@/lib/store'

export function WalkthroughTab() {
  const mode = useLab((s) => s.workshopMode)
  const setMode = useLab((s) => s.setWorkshopMode)
  const layout = useLab((s) => s.walkthroughLayout)
  const setLayout = useLab((s) => s.setWalkthroughLayout)

  if (!mode) {
    return (
      <div className="p-4 text-sm space-y-3">
        <h3 className="font-semibold text-text">Walkthrough</h3>
        <p className="text-muted">
          The 35-step SDLC walkthrough isn't running. Start it to see the
          tour appear here (or as a draggable floating panel).
        </p>
        <button
          type="button"
          className="px-3 py-1.5 text-xs rounded border border-border bg-surface-2 text-text hover:bg-bg"
          onClick={() => {
            setMode(true)
            setLayout('inspector')
          }}
          data-testid="walkthrough-tab-start"
        >
          Start walkthrough here
        </button>
      </div>
    )
  }

  if (layout !== 'inspector') {
    return (
      <div className="p-4 text-sm space-y-3">
        <h3 className="font-semibold text-text">Walkthrough is floating</h3>
        <p className="text-muted">
          The walkthrough is currently a draggable panel. Drag it to reposition
          or pop it in here.
        </p>
        <button
          type="button"
          className="px-3 py-1.5 text-xs rounded border border-border bg-surface-2 text-text hover:bg-bg"
          onClick={() => setLayout('inspector')}
          data-testid="walkthrough-tab-pop-in"
        >
          ↪ Pop into this tab
        </button>
      </div>
    )
  }

  return (
    <div className="p-3">
      <div className="flex items-center justify-end mb-2">
        <button
          type="button"
          className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted hover:text-text"
          onClick={() => setLayout('floating')}
          title="Pop the walkthrough back out as a draggable panel"
          data-testid="walkthrough-tab-pop-out"
        >
          ↗ pop out
        </button>
      </div>
      <WorkshopBody />
    </div>
  )
}
