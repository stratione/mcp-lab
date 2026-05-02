import { useLab } from '@/lib/store'

export function FlyingBlindBanner() {
  const on = useLab((s) => s.flyingBlind)
  if (!on) return null
  return (
    <div className="bg-warn/15 text-warn border-b border-warn/40 px-4 py-2 text-sm font-semibold text-center">
      ⚠ Flying Blind — no tools, no probes, no grounding. The model may fabricate.
    </div>
  )
}
