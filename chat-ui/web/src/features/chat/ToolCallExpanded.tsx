import type { ToolCall } from '@/lib/schemas'
import type { ReactNode } from 'react'

const MAX = 2048
function truncate(s: string) {
  if (s.length <= MAX) return { text: s, more: 0 }
  return { text: s.slice(0, MAX), more: s.length - MAX }
}

export function ToolCallExpanded({ call }: { call: ToolCall }) {
  const argsStr = JSON.stringify(call.arguments, null, 2)
  const resultStr = call.result == null ? '(no result)' : String(call.result)
  const a = truncate(argsStr)
  const r = truncate(resultStr)
  return (
    <div className="bg-surface-2 border border-border rounded-[10px] p-3 my-1 font-mono text-xs">
      <Label>arguments</Label>
      <Block text={a.text} more={a.more} full={argsStr} />
      <Label>result</Label>
      <Block text={r.text} more={r.more} full={resultStr} />
    </div>
  )
}

function Label({ children }: { children: ReactNode }) {
  return <div className="font-sans text-[10px] uppercase tracking-wider text-muted mb-1">{children}</div>
}

function Block({ text, more, full }: { text: string; more: number; full: string }) {
  return (
    <div className="mb-2">
      <pre className="whitespace-pre-wrap text-text">{text}{more > 0 && <span className="text-faint">… (+{more} bytes)</span>}</pre>
      <button
        type="button"
        onClick={() => navigator.clipboard.writeText(full)}
        className="text-xs text-muted hover:text-text underline"
      >
        copy
      </button>
    </div>
  )
}
