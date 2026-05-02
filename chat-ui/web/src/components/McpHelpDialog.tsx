// chat-ui/web/src/components/McpHelpDialog.tsx
//
// "?" → modal that explains how to enable each MCP server.
// Lists all five MCP servers with: brief description, live status pill,
// tool count, copy-able start/stop commands (engine-aware: docker vs
// podman), and live Start/Stop buttons that hit /api/mcp-control.
//
// Lives in the header next to the "◇ Architecture" button.

import { useEffect, useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { getMcpStatusEnvelope, mcpControl } from '@/lib/api'
import { backingUrlsFor } from '@/lib/mcp-backing'

type ServerSpec = {
  name: string
  blurb: string
  toolNames: string
}

// Static metadata that the API doesn't expose. Refresh if a new MCP server
// gets added (mcp-server/mcp_server/tools/<name>_tools.py is the source).
const SERVERS: ServerSpec[] = [
  {
    name: 'mcp-user',
    blurb: 'CRUD on the user-api: list, create, update, delete users; list roles.',
    toolNames: 'list_users, create_user, get_user, update_user, delete_user, list_roles, …',
  },
  {
    name: 'mcp-gitea',
    blurb: 'Git operations against the local Gitea: repos, commits, branches, search.',
    toolNames: 'list_repos, get_repo, list_commits, list_branches, search_code, …',
  },
  {
    name: 'mcp-registry',
    blurb: 'Container registry queries: catalog, tags, manifests for both registry-dev and registry-prod.',
    toolNames: 'list_images, list_tags, get_manifest',
  },
  {
    name: 'mcp-promotion',
    blurb: 'Promote images between registries (dev → staging → prod) via the promotion-service.',
    toolNames: 'promote_image, list_promotions, get_promotion_status',
  },
  {
    name: 'mcp-runner',
    blurb: 'CI/CD pipeline: clone the hello world app source from gitea, build the image, push to registry-dev, and deploy hello-world-app containers.',
    toolNames: 'build_image, scan_image, deploy_app',
  },
]

export function McpHelpDialog() {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="ml-1 text-xs text-muted hover:text-text border border-border rounded-md px-2 py-1 transition-colors"
          data-testid="mcp-help-button"
          title="How to turn each MCP server on/off"
          aria-label="MCP server help"
        >
          ?
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>How to enable each MCP server</DialogTitle>
        </DialogHeader>
        <McpHelpBody />
      </DialogContent>
    </Dialog>
  )
}

function McpHelpBody() {
  const status = useQuery({
    queryKey: ['mcp-status-envelope'],
    queryFn: ({ signal }) => getMcpStatusEnvelope(signal),
    refetchInterval: 5_000,
  })
  const engine = status.data?.engine ?? 'docker'
  // /api/mcp-status returns server names with the "mcp-" prefix stripped
  // (mcp_client.py:134 host.replace("mcp-", "")). Match by suffix so the
  // pill shows live status for our canonical "mcp-user"-style spec names.
  const liveByName = new Map(
    (status.data?.servers ?? []).map((s) => [s.name.startsWith('mcp-') ? s.name : `mcp-${s.name}`, s]),
  )

  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted">
        All MCP servers start <strong>off</strong> by default. The lab is intentionally
        cold-open so you can watch the LLM hallucinate without tools, then enable each
        server one at a time and see grounded answers replace fabrications.
      </p>
      <p className="text-muted">
        Engine: <code className="font-mono text-xs">{engine}</code> · run commands from the
        <code className="font-mono text-xs"> mcp-lab/</code> directory · or click the buttons.
      </p>

      <div className="space-y-3">
        {SERVERS.map((spec) => (
          <ServerRow key={spec.name} spec={spec} engine={engine} live={liveByName.get(spec.name)} />
        ))}
      </div>

      <hr className="border-border" />
      <p className="text-xs text-muted">
        Status auto-refreshes every 5s. If a Start button fails, copy the command into a
        terminal at the <code className="font-mono">mcp-lab/</code> project root to see
        compose's full error output.
      </p>
    </div>
  )
}

function ServerRow({
  spec,
  engine,
  live,
}: {
  spec: ServerSpec
  engine: string
  live?: { status: string; tool_count?: number; port?: number | null }
}) {
  const qc = useQueryClient()
  const isOnline = live?.status === 'online'
  const startCmd = `${engine} compose up -d ${spec.name}`
  const stopCmd = `${engine} compose stop ${spec.name}`
  const hostUrl = live?.port != null ? `http://localhost:${live.port}/mcp` : null

  // Hold the button in "Starting…" / "Stopping…" until live status confirms.
  // Without this, the button reads "Start" again the moment the mutation
  // returns — but the MCP server takes a couple seconds to actually answer,
  // so users instinctively click again. See ServersTab for the same fix.
  const [waitingStart, setWaitingStart] = useState(false)
  const [waitingStop, setWaitingStop] = useState(false)

  const startMut = useMutation({
    mutationFn: () => mcpControl(spec.name, 'start'),
    onMutate: () => setWaitingStart(true),
    onError: () => setWaitingStart(false),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['mcp-status-envelope'] })
      qc.invalidateQueries({ queryKey: ['mcp-status'] })
      qc.invalidateQueries({ queryKey: ['tools'] })
    },
  })
  const stopMut = useMutation({
    mutationFn: () => mcpControl(spec.name, 'stop'),
    onMutate: () => setWaitingStop(true),
    onError: () => setWaitingStop(false),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['mcp-status-envelope'] })
      qc.invalidateQueries({ queryKey: ['mcp-status'] })
      qc.invalidateQueries({ queryKey: ['tools'] })
    },
  })

  useEffect(() => {
    if (waitingStart && isOnline) setWaitingStart(false)
  }, [isOnline, waitingStart])
  useEffect(() => {
    if (waitingStop && !isOnline) setWaitingStop(false)
  }, [isOnline, waitingStop])
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
    <div className="border border-border rounded-md p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <code className="font-mono text-sm font-semibold">{spec.name}</code>
          <StatusPill status={live?.status} />
          {isOnline && live?.tool_count != null && (
            <span className="text-[11px] text-muted">{live.tool_count} tools</span>
          )}
        </div>
        <div className="flex gap-1.5">
          {!isOnline ? (
            <Button
              size="sm"
              onClick={() => startMut.mutate()}
              disabled={startBusy}
              data-testid={`mcp-help-start-${spec.name}`}
            >
              {startBusy ? 'Starting…' : 'Start'}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => stopMut.mutate()}
              disabled={stopBusy}
              data-testid={`mcp-help-stop-${spec.name}`}
            >
              {stopBusy ? 'Stopping…' : 'Stop'}
            </Button>
          )}
        </div>
      </div>

      <p className="text-xs text-muted">{spec.blurb}</p>
      <p className="text-[11px] text-faint font-mono">tools: {spec.toolNames}</p>

      <div className="grid grid-cols-1 gap-1.5">
        <CommandRow label="Start" cmd={startCmd} />
        <CommandRow label="Stop" cmd={stopCmd} />
      </div>

      <div className="pt-2 border-t border-border space-y-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] uppercase tracking-wider text-faint w-10 shrink-0">Data</span>
          <p className="text-[11px] text-faint flex-1">
            The real APIs this MCP wraps — open to see the data the LLM gets when this server is on.
          </p>
        </div>
        <ul className="pl-12 space-y-1.5">
          {backingUrlsFor(spec.name).map((u) => (
            <li key={u.url} className="text-xs">
              <div>
                <a
                  href={u.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-muted hover:text-text hover:underline break-all"
                >
                  {u.url} ↗
                </a>
                {u.hint && <span className="text-faint"> — {u.hint}</span>}
              </div>
              {u.credentials && (
                <div className="mt-1 rounded-md border border-warn/40 bg-warn/10 p-2 space-y-1">
                  <div className="text-[10px] uppercase tracking-wider text-warn font-semibold">Login</div>
                  <CredRow label="username" value={u.credentials.username} />
                  <CredRow label="password" value={u.credentials.password} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      {hostUrl && (
        <details className="text-[11px] text-faint pt-1">
          <summary className="cursor-pointer hover:text-muted">MCP endpoint (SSE — not browser-friendly)</summary>
          <div className="mt-1 space-y-1">
            <code className="block font-mono bg-bg border border-border rounded p-1.5 break-all">
              {hostUrl}
            </code>
            <CommandRow label="curl" cmd={`curl -sS -H 'Accept: text/event-stream' ${hostUrl}`} />
          </div>
        </details>
      )}

      {(startMut.isError || stopMut.isError) && (
        <p className="text-xs text-err">
          {String(startMut.error ?? stopMut.error)}
        </p>
      )}
    </div>
  )
}

function StatusPill({ status }: { status?: string }) {
  if (status === 'online') {
    return <span className="text-[10px] uppercase tracking-wider bg-ok/15 text-ok border border-ok/40 rounded px-1.5 py-0.5">online</span>
  }
  if (status === 'offline') {
    return <span className="text-[10px] uppercase tracking-wider bg-faint/15 text-muted border border-border rounded px-1.5 py-0.5">offline</span>
  }
  return <span className="text-[10px] uppercase tracking-wider bg-warn/15 text-warn border border-warn/40 rounded px-1.5 py-0.5">{status ?? '—'}</span>
}

function CommandRow({ label, cmd }: { label: string; cmd: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    await navigator.clipboard.writeText(cmd)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-wider text-faint w-10 shrink-0">{label}</span>
      <code className="flex-1 font-mono text-xs bg-bg border border-border rounded p-1.5 break-all">
        $ {cmd}
      </code>
      <Button size="sm" variant="outline" onClick={copy}>
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  )
}

function CredRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-faint w-16 shrink-0">{label}</span>
      <code className="flex-1 font-mono text-[11px] bg-bg border border-border rounded px-1.5 py-0.5">
        {value}
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
