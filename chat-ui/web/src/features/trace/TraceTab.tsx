import { useLab } from '@/lib/store'

export function TraceTab() {
  const traces = useLab((s) => s.traces)
  if (traces.length === 0) return <div className="p-3 text-sm text-muted">No tool calls yet.</div>
  return (
    <div className="p-3 text-sm">
      {traces.map((t) => (
        <div key={t.id} className="grid grid-cols-[80px_1fr_auto] gap-2 py-1.5 border-b border-dashed border-border last:border-b-0 items-center">
          <span className="font-mono text-[10px] text-faint">{new Date(t.ts).toLocaleTimeString([], { hour12: false })}</span>
          <span className="font-mono text-text">{t.name}</span>
          <span className={t.ok ? 'text-ok text-xs' : 'text-err text-xs'}>{t.ok ? '✓' : '✗'}{t.durationMs ? ` ${t.durationMs}ms` : ''}</span>
        </div>
      ))}
    </div>
  )
}
