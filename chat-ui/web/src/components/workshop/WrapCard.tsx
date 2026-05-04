import { useLab } from '@/lib/store'
import { useServers } from '@/features/servers/useServers'

// Replaces the previous "re-show IntroCard" wrap — that was misleading because
// IntroCard says "all five MCPs are stopped" which is no longer true after the
// learner walked through the workshop. This card pulls live counts from the
// store + servers query so the summary always reflects what actually happened.

const TOTAL_MCPS = 5

export function WrapCard() {
  const traces = useLab((s) => s.traces)
  const messages = useLab((s) => s.messages)
  const { data: servers } = useServers()

  const onlineCount = (servers ?? []).filter((s) => s.status === 'online').length
  // A "real tool call" is a trace entry — those are recorded by chat.ts only
  // when the LLM actually invoked a tool, not when it printed JSON-as-text.
  const toolCalls = traces.length
  const okToolCalls = traces.filter((t) => t.ok).length
  const userTurns = messages.filter((m) => m.role === 'user').length

  return (
    <div data-testid="workshop-wrap" className="space-y-3">
      <h3 className="font-semibold">You made it through.</h3>
      <p className="text-muted">
        Here's what actually happened in this session:
      </p>
      <ul className="space-y-1 text-sm">
        <li>
          <span className="text-text font-mono">{onlineCount}</span>
          <span className="text-faint"> / {TOTAL_MCPS}</span>{' '}
          <span className="text-muted">MCP servers running</span>
        </li>
        <li>
          <span className="text-text font-mono">{userTurns}</span>{' '}
          <span className="text-muted">questions asked</span>
        </li>
        <li>
          <span className="text-text font-mono">{toolCalls}</span>{' '}
          <span className="text-muted">real tool calls executed</span>
          {toolCalls > 0 && (
            <span className="text-faint"> ({okToolCalls} succeeded)</span>
          )}
        </li>
      </ul>

      {toolCalls === 0 && (
        <p className="text-xs text-warn">
          No tool calls were recorded. If you saw raw JSON in replies, the model
          named the right tool but didn't execute it — try a larger model or an
          OpenAI / Anthropic key from the provider chip below.
        </p>
      )}

      <div className="border-t border-border pt-3 space-y-2">
        <p className="text-xs text-muted font-medium">Where to go next:</p>
        <ul className="text-xs text-muted space-y-1 pl-4 list-disc marker:text-faint">
          <li>Open the <span className="font-mono">Tools</span> tab to see every tool grouped by MCP.</li>
          <li>Open the <span className="font-mono">Trace</span> tab to inspect the calls made above.</li>
          <li>Open the <span className="font-mono">Compare</span> tab to run two providers side-by-side on the same prompt.</li>
          <li>Switch providers in the chip below — API LLMs (OpenAI / Anthropic / Google) tend to call tools much more reliably than small local Ollama models.</li>
        </ul>
      </div>
    </div>
  )
}
