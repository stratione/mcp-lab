import { useState } from 'react'
import { ToolCallExpanded } from './ToolCallExpanded'
import type { ToolCall } from '@/lib/schemas'

export function ToolCallSummary({ call }: { call: ToolCall }) {
  const [open, setOpen] = useState(false)
  const ok = call.result != null && !String(call.result).startsWith('Error')
  return (
    <div className="my-1">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-sm text-muted px-1 py-0.5 hover:text-text w-full text-left"
      >
        <span className="bg-tool-bg text-tool-fg px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide">tool</span>
        <span className="font-mono text-text">{call.name}</span>
        <span className={ok ? 'text-ok' : 'text-err'}>{ok ? '✓' : '✗'}</span>
        {call.duration_ms != null && (
          <span className="text-faint text-xs">{Math.round(call.duration_ms)}ms</span>
        )}
        <span className="ml-auto text-faint text-xs">{open ? '▴ collapse' : '▾ expand'}</span>
      </button>
      {open && <ToolCallExpanded call={call} />}
    </div>
  )
}
