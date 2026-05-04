import { useState } from 'react'
import type { ToolCall } from '@/lib/schemas'
import type { ReactNode } from 'react'
import { probeUrl } from '@/lib/api'
import { verifyFor } from '@/lib/tool-verify'

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
      <VerifyBlock call={call} />
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

/**
 * Per-tool "Verify" affordance — hits the source-of-truth URL for whatever
 * the tool just did and shows the raw response inline. Lets attendees
 * confirm the LLM didn't make anything up. Tools without a verifiable
 * source (e.g. mock scan_image) don't render the button at all.
 */
type VerifyState =
  | { status: 'idle' }
  | { status: 'probing' }
  | { status: 'ok'; httpStatus: number; body: unknown }
  | { status: 'err'; message: string }

function VerifyBlock({ call }: { call: ToolCall }) {
  const spec = verifyFor(call.name)
  const [state, setState] = useState<VerifyState>({ status: 'idle' })

  if (!spec) return null

  let url: string
  try {
    url = spec.url(call.arguments ?? {})
  } catch {
    return null
  }
  if (!url || url.includes('//') === false) return null

  async function run() {
    setState({ status: 'probing' })
    try {
      const r = await probeUrl(url)
      setState({ status: 'ok', httpStatus: r.status, body: r.body })
    } catch (e) {
      setState({ status: 'err', message: e instanceof Error ? e.message : String(e) })
    }
  }

  return (
    <div className="mt-2 pt-2 border-t border-border">
      <div className="flex items-center gap-2 mb-1">
        <span className="font-sans text-[10px] uppercase tracking-wider text-muted">verify</span>
        <span className="text-[10px] text-faint italic font-sans">{spec.hint}</span>
      </div>
      <div className="flex items-center gap-2 mb-2">
        <code className="flex-1 break-all bg-bg border border-border rounded px-2 py-1 text-[11px]">
          $ curl {url}
        </code>
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(`curl ${url}`)}
          className="text-[11px] text-muted hover:text-text underline px-1"
          title="Copy curl command"
        >
          copy
        </button>
        <button
          type="button"
          onClick={run}
          disabled={state.status === 'probing'}
          className="text-[11px] px-2 py-0.5 rounded border border-border bg-bg text-text hover:bg-surface-2 disabled:opacity-40"
          data-testid={`verify-${call.name}`}
        >
          {state.status === 'probing' ? 'probing…' : 'Verify'}
        </button>
      </div>
      {state.status === 'ok' && (
        <pre
          className="whitespace-pre-wrap text-[11px] bg-bg border border-border rounded p-2 max-h-48 overflow-auto"
          data-testid={`verify-result-${call.name}`}
        >
          <span className={state.httpStatus >= 200 && state.httpStatus < 300 ? 'text-ok' : 'text-warn'}>
            HTTP {state.httpStatus}
          </span>
          {'\n'}
          {typeof state.body === 'string' ? state.body : JSON.stringify(state.body, null, 2)}
        </pre>
      )}
      {state.status === 'err' && (
        <div className="text-[11px] text-err">probe failed: {state.message}</div>
      )}
    </div>
  )
}
