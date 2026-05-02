import { useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { useServers } from './useServers'
import { probeServer, mcpControl, getMcpStatusEnvelope } from '@/lib/api'
import { Button } from '@/components/ui/button'
import type { McpServer } from '@/lib/schemas'

export function ServersTab() {
  const { data, isLoading, error } = useServers()
  // Pull engine name from the envelope so each row's "how to start" command
  // matches the user's actual container engine. One shared query, deduped
  // across rows.
  const env = useQuery({
    queryKey: ['mcp-status-envelope'],
    queryFn: ({ signal }) => getMcpStatusEnvelope(signal),
    refetchInterval: 30_000,
  })
  const engine = env.data?.engine ?? 'docker'

  if (isLoading) return <div className="p-3 text-sm text-muted">Loading…</div>
  if (error) return <div className="p-3 text-sm text-err">Failed to load servers.</div>
  return (
    <div className="p-3 flex flex-col gap-1.5">
      {data?.map((s) => <ServerRow key={s.name} server={s} engine={engine} />)}
    </div>
  )
}

function ServerRow({ server, engine }: { server: McpServer; engine: string }) {
  const [verifyResult, setVerifyResult] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
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
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? `Hide instructions for ${server.name}` : `Show how to start/stop ${server.name}`}
            title="How to start / stop this server"
            className="text-muted hover:text-text w-4 text-center select-none leading-none"
            data-testid={`server-row-toggle-${server.name}`}
          >
            <span className={`inline-block transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
          </button>
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
      {open && <ServerInstructions name={server.name} engine={engine} isOnline={isOnline} />}
      {verifyResult && (
        <pre className="bg-bg border-t border-border text-[11px] font-mono p-2 whitespace-pre-wrap max-h-48 overflow-auto">{verifyResult}</pre>
      )}
    </div>
  )
}

function ServerInstructions({
  name,
  engine,
  isOnline,
}: {
  name: string
  engine: string
  isOnline: boolean
}) {
  const qc = useQueryClient()
  const startCmd = `${engine} compose up -d ${name}`
  const stopCmd = `${engine} compose stop ${name}`

  const startMut = useMutation({
    mutationFn: () => mcpControl(name, 'start'),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['mcp-status'] })
      qc.invalidateQueries({ queryKey: ['mcp-status-envelope'] })
    },
  })
  const stopMut = useMutation({
    mutationFn: () => mcpControl(name, 'stop'),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['mcp-status'] })
      qc.invalidateQueries({ queryKey: ['mcp-status-envelope'] })
    },
  })

  return (
    <div className="bg-bg border-t border-border p-2 space-y-1.5">
      <div className="flex gap-1.5 items-center">
        {!isOnline ? (
          <Button
            size="sm"
            onClick={() => startMut.mutate()}
            disabled={startMut.isPending}
            data-testid={`server-row-start-${name}`}
          >
            {startMut.isPending ? 'Starting…' : 'Start'}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => stopMut.mutate()}
            disabled={stopMut.isPending}
            data-testid={`server-row-stop-${name}`}
          >
            {stopMut.isPending ? 'Stopping…' : 'Stop'}
          </Button>
        )}
        <span className="text-[10px] text-faint">or run from a terminal:</span>
      </div>
      <CommandLine label="start" cmd={startCmd} />
      <CommandLine label="stop" cmd={stopCmd} />
      {(startMut.isError || stopMut.isError) && (
        <p className="text-[11px] text-err">{String(startMut.error ?? stopMut.error)}</p>
      )}
    </div>
  )
}

function CommandLine({ label, cmd }: { label: string; cmd: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    await navigator.clipboard.writeText(cmd)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-faint w-8 shrink-0">{label}</span>
      <code className="flex-1 font-mono text-[11px] bg-surface border border-border rounded px-1.5 py-1 break-all">
        {cmd}
      </code>
      <button
        type="button"
        onClick={copy}
        className="text-[10px] text-muted hover:text-text border border-border rounded px-1.5 py-0.5"
      >
        {copied ? 'copied' : 'copy'}
      </button>
    </div>
  )
}
