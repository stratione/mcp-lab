// chat-ui/web/src/components/McpHelpDialog.tsx
//
// "?" → modal that explains how to enable each MCP server.
// Lists all five MCP servers with: brief description, live status pill,
// tool count, copy-able start/stop commands (engine-aware: docker vs
// podman), and live Start/Stop buttons that hit /api/mcp-control.
//
// Lives in the header next to the "◇ Architecture" button.

import { useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { getMcpStatusEnvelope, mcpControl } from '@/lib/api'

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
    blurb: 'CI/CD pipeline: clone source from gitea, build the image, push to registry-dev, and deploy hello-app containers.',
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
  const liveByName = new Map((status.data?.servers ?? []).map((s) => [s.name, s]))

  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted">
        All MCP servers start <strong>off</strong> by default. The lab is intentionally
        cold-open so you can watch the LLM hallucinate without tools, then enable each
        server one at a time and see grounded answers replace fabrications.
      </p>
      <p className="text-muted">
        Engine detected: <code className="font-mono text-xs">{engine}</code> · use the buttons or copy the commands into a terminal.
      </p>

      <div className="space-y-3">
        {SERVERS.map((spec) => (
          <ServerRow key={spec.name} spec={spec} engine={engine} live={liveByName.get(spec.name)} />
        ))}
      </div>

      <hr className="border-border" />
      <p className="text-xs text-muted">
        Status auto-refreshes every 5s. If a Start button fails, copy the command into a terminal at the
        project root to see compose's full error output.
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
  live?: { status: string; tool_count?: number }
}) {
  const qc = useQueryClient()
  const isOnline = live?.status === 'online'
  const startCmd = `${engine} compose up -d ${spec.name}`
  const stopCmd = `${engine} compose stop ${spec.name}`

  const startMut = useMutation({
    mutationFn: () => mcpControl(spec.name, 'start'),
    onSettled: () => qc.invalidateQueries({ queryKey: ['mcp-status-envelope'] }),
  })
  const stopMut = useMutation({
    mutationFn: () => mcpControl(spec.name, 'stop'),
    onSettled: () => qc.invalidateQueries({ queryKey: ['mcp-status-envelope'] }),
  })

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
              disabled={startMut.isPending}
              data-testid={`mcp-help-start-${spec.name}`}
            >
              {startMut.isPending ? 'Starting…' : 'Start'}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => stopMut.mutate()}
              disabled={stopMut.isPending}
              data-testid={`mcp-help-stop-${spec.name}`}
            >
              {stopMut.isPending ? 'Stopping…' : 'Stop'}
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
