// "Try" tab — copy-pasteable example prompts grouped by MCP server.
//
// Only sections for currently-online MCPs are shown, so the list grows as
// the attendee enables more servers. Clicking a prompt fills the chat
// input via the existing pendingPrompt store mechanism (the workshop
// wizard uses the same channel). Copy button puts the text on the
// clipboard for users who'd rather paste manually.

import { useState } from 'react'
import { useServers } from '@/features/servers/useServers'
import { useLab } from '@/lib/store'
import { promptsFor, titleFor, type PromptSuggestion } from '@/lib/mcp-prompts'

export function TryTab() {
  const { data: servers, isLoading } = useServers()
  const setPending = useLab((s) => s.setPendingPrompt)

  if (isLoading) return <div className="p-3 text-sm text-muted">Loading…</div>

  const allOffline = (servers ?? []).every((s) => s.status !== 'online')

  return (
    <div className="p-3 space-y-3 text-sm">
      <p className="text-[11px] text-muted">
        Pick a prompt — it drops straight into the chat input. As you turn on more MCP
        servers, more prompts show up here.
      </p>

      {allOffline && (
        <div className="border border-dashed border-border rounded-md p-3 text-xs text-faint">
          No MCPs are online yet. Open the <strong>Servers</strong> tab and click
          <strong> Start</strong> on any server to see prompts you can run against it.
        </div>
      )}

      {(servers ?? []).map((srv) => {
        if (srv.status !== 'online') return null
        const prompts = promptsFor(srv.name)
        if (prompts.length === 0) return null
        return (
          <section key={srv.name} className="space-y-1.5">
            <h4 className="text-[11px] uppercase tracking-wider text-faint">
              {titleFor(srv.name)} <span className="text-muted normal-case">· mcp-{srv.name}</span>
            </h4>
            <ul className="space-y-1">
              {prompts.map((p) => (
                <PromptRow key={p.prompt} suggestion={p} onPick={(text) => setPending(text)} />
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function PromptRow({
  suggestion,
  onPick,
}: {
  suggestion: PromptSuggestion
  onPick: (text: string) => void
}) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    await navigator.clipboard.writeText(suggestion.prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }
  return (
    <li className="bg-surface-2 border border-border rounded-md px-2 py-1.5 flex items-start gap-2">
      <button
        type="button"
        onClick={() => onPick(suggestion.prompt)}
        className="flex-1 text-left text-[12px] hover:text-text"
        title="Drop this prompt into the chat input"
      >
        “{suggestion.prompt}”
        {suggestion.tool && (
          <span className="ml-1 text-[10px] text-faint font-mono">→ {suggestion.tool}</span>
        )}
        {suggestion.hint && (
          <span className="ml-1 text-[10px] text-faint italic">({suggestion.hint})</span>
        )}
      </button>
      <button
        type="button"
        onClick={copy}
        className="text-[10px] text-muted hover:text-text border border-border rounded px-1.5 py-0.5 shrink-0"
        title="Copy to clipboard"
      >
        {copied ? 'copied' : 'copy'}
      </button>
    </li>
  )
}
