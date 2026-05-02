import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getTools, getMcpStatus } from '@/lib/api'
import type { ToolDef } from '@/lib/schemas'
import { ToolDrawer } from './ToolDrawer'

// Display order — matches the workshop arc (user → gitea → registry → promotion → runner).
// Anything else falls under "other".
const CATEGORY_ORDER = ['user', 'gitea', 'registry', 'promotion', 'runner', 'other']

const CATEGORY_LABEL: Record<string, string> = {
  user: 'USER',
  gitea: 'GITEA',
  registry: 'REGISTRY',
  promotion: 'PROMOTION',
  runner: 'RUNNER',
  other: 'OTHER',
}

export function ToolsTab() {
  const qc = useQueryClient()
  // Re-fetch tools whenever ANY MCP server is offline (3s) so newly-enabled
  // servers' tools show up within ~3s of clicking Start. When everything's
  // online we slow to 30s.
  const status = useQuery({
    queryKey: ['mcp-status'],
    queryFn: ({ signal }) => getMcpStatus(signal),
  })
  const anyOffline = (status.data ?? []).some((s) => s.status !== 'online')

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['tools'],
    queryFn: ({ signal }) => getTools(signal),
    refetchInterval: anyOffline ? 3_000 : 30_000,
  })

  const [active, setActive] = useState<ToolDef | null>(null)

  const grouped = useMemo(() => {
    const buckets: Record<string, ToolDef[]> = {}
    for (const t of data?.tools ?? []) {
      const cat = t.category || 'other'
      ;(buckets[cat] ||= []).push(t)
    }
    // Render in workshop order; unknown categories drift to the end alphabetically.
    const ordered: [string, ToolDef[]][] = CATEGORY_ORDER.flatMap((c) =>
      buckets[c] ? [[c, buckets[c]] as [string, ToolDef[]]] : [],
    )
    const extras: [string, ToolDef[]][] = Object.entries(buckets)
      .filter(([c]) => !CATEGORY_ORDER.includes(c))
      .sort(([a], [b]) => a.localeCompare(b))
    return ordered.concat(extras)
  }, [data])

  const totalTools = data?.tools?.length ?? 0

  if (isLoading) return <div className="p-3 text-sm text-muted">Loading tools…</div>
  if (error) return <div className="p-3 text-sm text-err">Failed to load tools.</div>

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] text-muted">
          {totalTools} tool{totalTools === 1 ? '' : 's'} available
        </span>
        <button
          type="button"
          onClick={() => {
            qc.invalidateQueries({ queryKey: ['tools'] })
            refetch()
          }}
          disabled={isFetching}
          className="text-[10px] text-muted hover:text-text border border-border rounded px-2 py-0.5 disabled:opacity-50"
          title="Re-fetch tools from every MCP server"
          data-testid="tools-refresh"
        >
          {isFetching ? 'refreshing…' : '↻ refresh'}
        </button>
      </div>
      {totalTools === 0 ? (
        <div className="border border-dashed border-border rounded-md p-3 text-xs text-faint">
          No tools available. Open the <strong>Servers</strong> tab and click <strong>Start</strong> on any MCP to populate this list.
        </div>
      ) : (
        grouped.map(([cat, list]) => (
          <div key={cat} className="mb-3">
            <div className="text-[10px] uppercase tracking-wider text-muted mb-1.5">
              {CATEGORY_LABEL[cat] ?? cat.toUpperCase()} · {list.length}
            </div>
            <div>
              {list.map((t) => (
                <button
                  key={t.name}
                  onClick={() => setActive(t)}
                  className="w-full flex justify-between items-center text-sm font-mono py-1.5 hover:text-text text-left"
                >
                  <span>{t.name}</span>
                  <span className="text-[10px] uppercase tracking-wider text-faint border border-border bg-bg rounded px-1.5 py-0.5 font-sans">
                    {CATEGORY_LABEL[cat] ?? cat.toUpperCase()}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))
      )}
      <ToolDrawer tool={active} onClose={() => setActive(null)} />
    </div>
  )
}
