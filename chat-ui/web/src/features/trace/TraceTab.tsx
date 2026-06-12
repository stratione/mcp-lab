import { useLab } from '@/lib/store'

export function TraceTab() {
  const traces = useLab((s) => s.traces)
  const clearTraces = useLab((s) => s.clearTraces)

  if (traces.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted">
        <div className="text-2xl mb-2 opacity-50" aria-hidden>
          ⛓
        </div>
        No tool calls yet.
        <div className="text-xs text-faint mt-1.5 leading-relaxed">
          Ask the agent to do something — every MCP tool it calls shows up here with its status and
          timing, so you can see exactly what it did.
        </div>
      </div>
    )
  }

  const failed = traces.filter((t) => !t.ok).length
  return (
    <div className="text-sm">
      <div className="sticky top-0 z-10 flex items-center justify-between px-3 py-2 border-b border-border bg-surface">
        <span className="text-xs text-muted">
          {traces.length} call{traces.length === 1 ? '' : 's'}
          {failed > 0 && <span className="text-err"> · {failed} failed</span>}
        </span>
        <button
          type="button"
          onClick={clearTraces}
          className="text-[11px] text-faint hover:text-text border border-border rounded px-1.5 py-0.5 transition-colors"
        >
          Clear
        </button>
      </div>
      <ul>
        {traces.map((t) => (
          <li
            key={t.id}
            className={
              'grid grid-cols-[16px_1fr_auto] gap-2 items-center px-3 py-1.5 border-b border-dashed border-border/60 last:border-b-0 ' +
              (t.ok ? '' : 'bg-err/5')
            }
          >
            <span className={'inline-flex justify-center font-semibold ' + (t.ok ? 'text-ok' : 'text-err')}>
              {t.ok ? '✓' : '✗'}
            </span>
            <span className="font-mono text-text truncate" title={t.name}>
              {t.name}
            </span>
            <span className="text-right text-[10px] font-mono text-faint whitespace-nowrap">
              {t.durationMs != null && (
                <span className={t.ok ? 'text-muted' : 'text-err'}>{t.durationMs}ms</span>
              )}
              <span className="ml-1.5">
                {new Date(t.ts).toLocaleTimeString([], { hour12: false })}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
