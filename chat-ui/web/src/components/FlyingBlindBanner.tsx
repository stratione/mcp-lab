// The lab's opening lesson, made visible. While "Flying Blind" is on the model
// answers with no tools — so it confidently fabricates. This strip names that,
// explains why on hover, and points to where you turn a tool on. It auto-hides
// the moment an MCP server comes online (App clears flyingBlind), so it doubles
// as a "you've escaped lying mode" signal.
import { useLab } from '@/lib/store'
import { InfoDot } from '@/components/HelpTip'
import { FLYING_BLIND_HELP } from '@/lib/help'

export function FlyingBlindBanner() {
  const flyingBlind = useLab((s) => s.flyingBlind)
  const setInspectorTab = useLab((s) => s.setInspectorTab)
  if (!flyingBlind) return null
  return (
    <div
      role="status"
      className="flex items-center gap-2 px-5 py-2 text-xs bg-warn/10 border-b border-warn/30 animate-in fade-in slide-in-from-top-1 duration-300"
    >
      <span aria-hidden className="text-warn">⚠</span>
      <span className="text-text/90">
        <strong className="font-semibold text-warn">Flying Blind</strong> — the model has no tools,
        so it will confidently make things up.
      </span>
      <InfoDot side="bottom" title="Flying Blind" body={FLYING_BLIND_HELP} className="text-warn" />
      <button
        type="button"
        onClick={() => setInspectorTab('servers')}
        className="ml-auto shrink-0 rounded-md border border-warn/40 text-warn hover:bg-warn/15 px-2 py-1 transition-colors"
      >
        Enable an MCP server →
      </button>
    </div>
  )
}
