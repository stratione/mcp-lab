import { useEffect, useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { useServers } from './useServers'
import { mcpControl, getMcpStatusEnvelope } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { backingUrlsFor } from '@/lib/mcp-backing'
import type { McpServer } from '@/lib/schemas'

export function ServersTab() {
  const { data, isLoading, error } = useServers()
  // Pull engine + host project dir from the envelope so each row's
  // "how to start" command works regardless of where the user is sitting
  // in their terminal. One shared query, deduped across rows.
  const env = useQuery({
    queryKey: ['mcp-status-envelope'],
    queryFn: ({ signal }) => getMcpStatusEnvelope(signal),
    refetchInterval: 30_000,
  })
  const engine = env.data?.engine ?? 'docker'
  const hostDir = env.data?.host_project_dir ?? ''

  if (isLoading) return <div className="p-3 text-sm text-muted">Loading…</div>
  if (error) return <div className="p-3 text-sm text-err">Failed to load servers.</div>
  return (
    <div className="p-3 flex flex-col gap-1.5">
      {data?.map((s) => <ServerRow key={s.name} server={s} engine={engine} hostDir={hostDir} />)}
    </div>
  )
}

function ServerRow({ server, engine, hostDir }: { server: McpServer; engine: string; hostDir: string }) {
  const [open, setOpen] = useState(false)
  const isOnline = server.status === 'online'
  const isDegraded = server.status === 'degraded'
  const statusColor = isOnline ? 'text-ok' : isDegraded ? 'text-warn' : 'text-err'
  const statusGlyph = isOnline ? '▲' : isDegraded ? '◆' : '▼'
  // Public host URL anyone can hit from a host-side browser/curl.
  // The internal server.url uses the compose DNS name (mcp-user:8003) which
  // isn't reachable from the host; rebuild as localhost:<port>.
  const hostUrl = server.port != null ? `http://localhost:${server.port}/mcp` : null

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
          {server.port != null && (
            <span title={hostUrl ? `${hostUrl} (SSE — see expand for curl)` : undefined}>
              :{server.port}
            </span>
          )}
          {server.latency_ms != null && `· ${server.latency_ms}ms`}
        </span>
      </div>
      {open && (
        <ServerInstructions
          name={server.name}
          engine={engine}
          hostDir={hostDir}
          hostUrl={hostUrl}
          isOnline={isOnline}
        />
      )}
      {open && (
        <p className="bg-bg border-t border-border text-[10px] text-faint px-2 py-1">
          Run from the <code className="font-mono">mcp-lab/</code> directory (the project root).
        </p>
      )}
    </div>
  )
}

function ServerInstructions({
  name,
  engine,
  hostUrl,
  isOnline,
}: {
  name: string
  engine: string
  hostDir: string  // accepted for symmetry; not rendered (we don't want to leak the user's home path)
  hostUrl: string | null
  isOnline: boolean
}) {
  const qc = useQueryClient()
  // /api/mcp-status returns names with the "mcp-" prefix stripped
  // (mcp_client.py:134 host.replace("mcp-", "")) — restore it before
  // showing the command and before calling /api/mcp-control.
  const fullName = name.startsWith('mcp-') ? name : `mcp-${name}`
  const startCmd = `${engine} compose up -d ${fullName}`
  const stopCmd = `${engine} compose stop ${fullName}`

  // Compose's `up -d` returns once the container is created — but the MCP
  // server inside it takes another second or two to actually answer SSE
  // probes. Without this, the button label stays "Start" until the next
  // status poll, so users instinctively click again. Track an extra
  // "waiting for status to flip" flag that holds the button in
  // "Starting…" / "Stopping…" until the live status confirms.
  const [waitingStart, setWaitingStart] = useState(false)
  const [waitingStop, setWaitingStop] = useState(false)

  const startMut = useMutation({
    mutationFn: () => mcpControl(fullName, 'start'),
    onMutate: () => setWaitingStart(true),
    onError: () => setWaitingStart(false),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['mcp-status'] })
      qc.invalidateQueries({ queryKey: ['mcp-status-envelope'] })
      qc.invalidateQueries({ queryKey: ['tools'] })
    },
  })
  const stopMut = useMutation({
    mutationFn: () => mcpControl(fullName, 'stop'),
    onMutate: () => setWaitingStop(true),
    onError: () => setWaitingStop(false),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['mcp-status'] })
      qc.invalidateQueries({ queryKey: ['mcp-status-envelope'] })
      qc.invalidateQueries({ queryKey: ['tools'] })
    },
  })

  // Clear the wait flag when reality catches up to the click.
  useEffect(() => {
    if (waitingStart && isOnline) setWaitingStart(false)
  }, [isOnline, waitingStart])
  useEffect(() => {
    if (waitingStop && !isOnline) setWaitingStop(false)
  }, [isOnline, waitingStop])
  // Failsafe: don't get stuck "Starting…" forever if the MCP never comes up.
  useEffect(() => {
    if (!waitingStart) return
    const t = setTimeout(() => setWaitingStart(false), 20_000)
    return () => clearTimeout(t)
  }, [waitingStart])
  useEffect(() => {
    if (!waitingStop) return
    const t = setTimeout(() => setWaitingStop(false), 20_000)
    return () => clearTimeout(t)
  }, [waitingStop])

  const startBusy = waitingStart || startMut.isPending
  const stopBusy = waitingStop || stopMut.isPending

  return (
    <div className="bg-bg border-t border-border p-2 space-y-1.5">
      <div className="flex gap-1.5 items-center">
        {!isOnline ? (
          <Button
            size="sm"
            onClick={() => startMut.mutate()}
            disabled={startBusy}
            data-testid={`server-row-start-${name}`}
          >
            {startBusy ? 'Starting…' : 'Start'}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => stopMut.mutate()}
            disabled={stopBusy}
            data-testid={`server-row-stop-${name}`}
          >
            {stopBusy ? 'Stopping…' : 'Stop'}
          </Button>
        )}
        <span className="text-[10px] text-faint">or run from a terminal:</span>
      </div>
      <CommandLine label="start" cmd={startCmd} />
      <CommandLine label="stop" cmd={stopCmd} />

      <BackingDataLinks name={name} />

      {hostUrl && (
        <details className="text-[10px] text-faint pt-1 border-t border-border">
          <summary className="cursor-pointer hover:text-muted">MCP endpoint (SSE — not browser-friendly)</summary>
          <div className="space-y-1 mt-1">
            <div className="flex items-center gap-1.5">
              <code className="flex-1 font-mono bg-surface border border-border rounded px-1.5 py-0.5 break-all">
                {hostUrl}
              </code>
              <CopyButton text={hostUrl} />
            </div>
            <CommandLine label="curl" cmd={`curl -sS -H 'Accept: text/event-stream' ${hostUrl}`} />
          </div>
        </details>
      )}
      {(startMut.isError || stopMut.isError) && (
        <p className="text-[11px] text-err">{String(startMut.error ?? stopMut.error)}</p>
      )}
    </div>
  )
}

function CommandLine({ label, cmd }: { label: string; cmd: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-faint w-8 shrink-0">{label}</span>
      <code className="flex-1 font-mono text-[11px] bg-surface border border-border rounded px-1.5 py-1 break-all">
        {cmd}
      </code>
      <CopyButton text={cmd} />
    </div>
  )
}

function BackingDataLinks({ name }: { name: string }) {
  const urls = backingUrlsFor(name)
  if (urls.length === 0) return null
  return (
    <div className="pt-1 border-t border-border space-y-1">
      <div className="flex items-baseline gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-faint w-8 shrink-0">data</span>
        <p className="text-[10px] text-faint flex-1">
          The real APIs this MCP wraps. Open in a tab to see the data the LLM gets when this server is on.
        </p>
      </div>
      <ul className="pl-10 space-y-1">
        {urls.map((u) => (
          <li key={u.url} className="text-[11px]">
            <div className="flex items-baseline gap-1.5">
              <a
                href={u.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-muted hover:text-text hover:underline break-all"
              >
                {u.url} ↗
              </a>
              {u.hint && <span className="text-faint text-[10px]">— {u.hint}</span>}
            </div>
            {u.credentials && <CredentialBox creds={u.credentials} />}
          </li>
        ))}
      </ul>
    </div>
  )
}

function CredentialBox({ creds }: { creds: { username: string; password: string } }) {
  return (
    <div className="mt-1 mb-1 rounded-md border border-warn/40 bg-warn/10 p-1.5 space-y-1">
      <div className="text-[9px] uppercase tracking-wider text-warn font-semibold">Login</div>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-faint w-14 shrink-0">username</span>
        <code className="flex-1 font-mono text-[11px] bg-bg border border-border rounded px-1 py-0.5">
          {creds.username}
        </code>
        <CopyButton text={creds.username} />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-faint w-14 shrink-0">password</span>
        <code className="flex-1 font-mono text-[11px] bg-bg border border-border rounded px-1 py-0.5">
          {creds.password}
        </code>
        <CopyButton text={creds.password} />
      </div>
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="text-[10px] text-muted hover:text-text border border-border rounded px-1.5 py-0.5"
    >
      {copied ? 'copied' : 'copy'}
    </button>
  )
}
