import { useState } from 'react'
import { useServers } from './useServers'
import { probeServer } from '@/lib/api'
import type { McpServer } from '@/lib/schemas'

export function ServersTab() {
  const { data, isLoading, error } = useServers()
  if (isLoading) return <div className="p-3 text-sm text-muted">Loading…</div>
  if (error) return <div className="p-3 text-sm text-err">Failed to load servers.</div>
  return (
    <div className="p-3 flex flex-col gap-1.5">
      {data?.map((s) => <ServerRow key={s.name} server={s} />)}
    </div>
  )
}

function ServerRow({ server }: { server: McpServer }) {
  const [verifyResult, setVerifyResult] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const isOnline = server.status === 'online'
  const isDegraded = server.status === 'degraded'
  const statusColor = isOnline ? 'text-ok' : isDegraded ? 'text-warn' : 'text-err'
  const statusGlyph = isOnline ? '▲' : isDegraded ? '◆' : '▼'

  async function verify() {
    setBusy(true)
    try {
      const r = await probeServer(server.name)
      setVerifyResult(r.ok ? r.output : (r.error || 'failed'))
    } catch (e) {
      setVerifyResult(e instanceof Error ? e.message : 'failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-surface-2 border border-border rounded-md text-sm">
      <div className="flex items-center justify-between px-2.5 py-2">
        <span className="flex items-center gap-2">
          <span
            className={`inline-flex items-center justify-center w-4 text-[10px] font-bold ${statusColor}`}
            aria-label={`status: ${server.status}`}
          >
            {statusGlyph}
          </span>
          {server.name}
        </span>
        <span className="flex items-center gap-2 text-xs text-faint">
          {server.port != null && `:${server.port}`}
          {server.latency_ms != null && `· ${server.latency_ms}ms`}
          <button
            onClick={verify}
            disabled={busy}
            className="bg-bg border border-border rounded px-2 py-0.5 text-muted hover:text-text disabled:opacity-50"
          >
            {busy ? '…' : 'verify'}
          </button>
        </span>
      </div>
      {verifyResult && (
        <pre className="bg-bg border-t border-border text-[11px] font-mono p-2 whitespace-pre-wrap max-h-48 overflow-auto">{verifyResult}</pre>
      )}
    </div>
  )
}
