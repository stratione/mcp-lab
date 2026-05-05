import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { useServers } from './useServers'
import {
  mcpControl,
  getMcpStatusEnvelope,
  getTools,
  getRegistriesCatalog,
  clearRegistry,
} from '@/lib/api'
import { Button } from '@/components/ui/button'
import { backingUrlsFor } from '@/lib/mcp-backing'
import { useLab } from '@/lib/store'
import type {
  McpServer,
  ToolDef,
  RegistrySummary,
  RegistryImage,
} from '@/lib/schemas'
import { ToolDrawer } from '@/features/tools/ToolDrawer'

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
  // After tier-aware setup, off-tier MCP images build in the background.
  // The envelope reports each as "ready" or "preparing" so we can label
  // Start buttons accordingly until the image lands on disk.
  const prebuildStatus = env.data?.prebuild_status ?? {}

  // Tools used to live in their own tab. They're now folded into each
  // ServerRow and the trailing OTHER row, so this query backs both.
  // Refetch fast (3s) when anything is offline; calm down once everything's
  // up.
  const anyOffline = (data ?? []).some((s) => s.status !== 'online')
  const toolsQuery = useQuery({
    queryKey: ['tools'],
    queryFn: ({ signal }) => getTools(signal),
    refetchInterval: anyOffline ? 3_000 : 30_000,
  })
  const allTools = toolsQuery.data?.tools ?? []
  const otherTools = useMemo(
    () => allTools.filter((t) => (t.category || 'other') === 'other'),
    [allTools],
  )

  // ToolDrawer state lives at the panel level so any row's tool click can
  // open the same dialog.
  const [activeTool, setActiveTool] = useState<ToolDef | null>(null)

  if (isLoading) return <div className="p-3 text-sm text-muted">Loading…</div>
  if (error) return <div className="p-3 text-sm text-err">Failed to load servers.</div>
  return (
    <div className="p-3 flex flex-col gap-1.5">
      {data?.map((s) => (
        <ServerRow
          key={s.name}
          server={s}
          engine={engine}
          hostDir={hostDir}
          prebuildStatus={prebuildStatus}
          allTools={allTools}
          onToolClick={setActiveTool}
        />
      ))}
      {otherTools.length > 0 && (
        <OtherToolsRow tools={otherTools} onToolClick={setActiveTool} />
      )}
      {/* Always-on view of dev/prod registry contents. Renders independent of
          mcp-registry's status because the registries themselves are
          standalone docker services and are usually up before the MCP. */}
      <RegistryCatalogCard />
      <ToolDrawer tool={activeTool} onClose={() => setActiveTool(null)} />
    </div>
  )
}

function ServerRow({
  server,
  engine,
  hostDir,
  prebuildStatus,
  allTools,
  onToolClick,
}: {
  server: McpServer
  engine: string
  hostDir: string
  prebuildStatus: Record<string, 'ready' | 'preparing'>
  allTools: ToolDef[]
  onToolClick: (t: ToolDef) => void
}) {
  // Three-state expand: user override > auto rule > closed.
  // Auto rule: when Flying Blind is on AND this server is offline, expand by
  // default so the Start button + compose command are immediately visible —
  // that's the "how do I escape lying mode" moment. User clicks lock in
  // their preference and override the auto rule for the rest of the session.
  const flyingBlind = useLab((s) => s.flyingBlind)
  const [override, setOverride] = useState<boolean | null>(null)
  const isOnline = server.status === 'online'
  const isDegraded = server.status === 'degraded'
  const autoOpen = flyingBlind && !isOnline
  const open = override ?? autoOpen
  const setOpen = (next: boolean) => setOverride(next)
  // Tools attributed to this server come from the /api/tools category field.
  // Filter once per render — cheap, list is small.
  const myTools = allTools.filter((t) => (t.category || 'other') === server.name)
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
            onClick={() => setOpen(!open)}
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
          {myTools.length > 0 && (
            <span title={`${myTools.length} tool${myTools.length === 1 ? '' : 's'} from this server`}>
              {myTools.length} tool{myTools.length === 1 ? '' : 's'}
            </span>
          )}
          {server.port != null && (
            <span title={hostUrl ? `${hostUrl} (SSE — see expand for curl)` : undefined}>
              :{server.port}
            </span>
          )}
          {server.latency_ms != null && `· ${server.latency_ms}ms`}
        </span>
      </div>
      {open && (
        <>
          <ServerInstructions
            name={server.name}
            engine={engine}
            hostDir={hostDir}
            hostUrl={hostUrl}
            isOnline={isOnline}
            prebuildStatus={prebuildStatus}
          />
          {myTools.length > 0 && (
            <ToolList
              category={server.name.toUpperCase()}
              tools={myTools}
              onToolClick={onToolClick}
            />
          )}
        </>
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
  prebuildStatus,
}: {
  name: string
  engine: string
  hostDir: string  // accepted for symmetry; not rendered (we don't want to leak the user's home path)
  hostUrl: string | null
  isOnline: boolean
  prebuildStatus: Record<string, 'ready' | 'preparing'>
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
  // After `make small/medium`, off-tier MCP images build in the background.
  // While that's running the Start button is disabled and shows "Preparing…"
  // — the row will flip to a normal "Start" button as soon as the image
  // lands on disk (mcp-status polls every few seconds, so this auto-clears).
  const isPreparing = !isOnline && prebuildStatus[fullName] === 'preparing'

  return (
    <div className="bg-bg border-t border-border p-2 space-y-1.5">
      <div className="flex gap-1.5 items-center">
        {!isOnline ? (
          <Button
            size="sm"
            onClick={() => startMut.mutate()}
            disabled={startBusy || isPreparing}
            data-testid={`server-row-start-${name}`}
            title={
              isPreparing
                ? 'Image is still building in the background — usually ready within ~60s of running make small/medium.'
                : undefined
            }
          >
            {isPreparing ? 'Preparing…' : startBusy ? 'Starting…' : 'Start'}
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

function ToolList({
  category,
  tools,
  onToolClick,
}: {
  category: string
  tools: ToolDef[]
  onToolClick: (t: ToolDef) => void
}) {
  return (
    <div className="bg-bg border-t border-border p-2">
      <div className="text-[10px] uppercase tracking-wider text-faint mb-1">
        Tools · {tools.length}
      </div>
      <ul className="space-y-0.5">
        {tools.map((t) => (
          <li key={t.name}>
            <button
              type="button"
              onClick={() => onToolClick(t)}
              className="w-full flex justify-between items-center text-[12px] font-mono py-1 px-1 hover:bg-surface-2 hover:text-text rounded text-left"
              title={t.description || ''}
              data-testid={`tool-row-${t.name}`}
            >
              <span className="truncate">{t.name}</span>
              <span className="text-[9px] uppercase tracking-wider text-faint border border-border bg-surface rounded px-1 py-0.5 font-sans shrink-0 ml-2">
                {category}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Pull the FastAPI `detail` field out of an ApiError so the user sees the
// real backend message (e.g. "start failed (exit 1): no such service") and
// not just "HTTP 500".
function extractClearError(err: unknown): string {
  if (err && typeof err === 'object' && 'detail' in err) {
    const d = (err as { detail?: unknown }).detail
    if (d && typeof d === 'object' && 'detail' in d) {
      const inner = (d as { detail?: unknown }).detail
      if (typeof inner === 'string') return inner
    }
    if (typeof d === 'string') return d
  }
  return err instanceof Error ? err.message : String(err)
}

// Returns "image:tag" strings for every (image, tag) pair so we can detect
// new arrivals across polls — used to flash freshly-built images.
function flattenTags(images: RegistryImage[]): Set<string> {
  const out = new Set<string>()
  for (const img of images) for (const t of img.tags) out.add(`${img.name}:${t}`)
  return out
}

function RegistryCatalogCard() {
  const { data, error, isLoading } = useQuery({
    queryKey: ['registries-catalog'],
    queryFn: ({ signal }) => getRegistriesCatalog(signal),
    // Faster while the audience is actively building (3s catches a push
    // within ~one teaching breath); slows once both registries are quiet.
    refetchInterval: 3_000,
  })
  // Track which image:tag pairs are "freshly seen" so the row can flash for
  // a few seconds when an image appears. Keyed per registry so promotion
  // (same tag landing in prod) also flashes.
  const seenRef = useRef<Record<string, Set<string>>>({})
  const [flashing, setFlashing] = useState<Record<string, Set<string>>>({})

  useEffect(() => {
    if (!data) return
    const nextFlashing: Record<string, Set<string>> = {}
    for (const reg of data.registries) {
      const seen = seenRef.current[reg.name] ?? new Set<string>()
      const current = flattenTags(reg.images)
      const fresh = new Set<string>()
      for (const key of current) if (!seen.has(key)) fresh.add(key)
      seenRef.current[reg.name] = current
      if (fresh.size > 0) nextFlashing[reg.name] = fresh
    }
    if (Object.keys(nextFlashing).length === 0) return
    setFlashing((prev) => {
      const merged = { ...prev }
      for (const [reg, set] of Object.entries(nextFlashing)) {
        merged[reg] = new Set([...(merged[reg] ?? []), ...set])
      }
      return merged
    })
    const t = setTimeout(() => {
      setFlashing((prev) => {
        const next = { ...prev }
        for (const reg of Object.keys(nextFlashing)) delete next[reg]
        return next
      })
    }, 4_000)
    return () => clearTimeout(t)
  }, [data])

  return (
    <div className="bg-surface-2 border border-border rounded-md text-sm">
      <div className="flex items-center justify-between px-2.5 py-2">
        <span className="flex items-center gap-2">
          <span className="w-4 text-center text-faint select-none leading-none">·</span>
          <span className="inline-flex items-center justify-center w-4 text-[10px] font-bold text-muted">
            ⛁
          </span>
          <span className="text-muted">registries</span>
        </span>
        <span className="text-xs text-faint">
          {isLoading ? 'loading…' : 'live · 3s'}
        </span>
      </div>
      <div className="bg-bg border-t border-border p-2 space-y-2">
        {error && <p className="text-[11px] text-err">Failed to load registry catalog.</p>}
        {data?.registries.map((reg) => (
          <RegistryColumn
            key={reg.name}
            reg={reg}
            flashing={flashing[reg.name] ?? new Set()}
          />
        ))}
        <p className="text-[10px] text-faint pt-1 border-t border-border">
          New images flash green when they first appear — that's <code className="font-mono">build_image</code> or{' '}
          <code className="font-mono">promote_image</code> landing.
        </p>
      </div>
    </div>
  )
}

function RegistryColumn({
  reg,
  flashing,
}: {
  reg: RegistrySummary
  flashing: Set<string>
}) {
  const qc = useQueryClient()
  const isOnline = reg.status === 'online'
  const totalTags = reg.images.reduce((n, i) => n + i.tags.length, 0)
  const hasContent = isOnline && reg.images.length > 0
  const clearMut = useMutation({
    mutationFn: () => clearRegistry(reg.name as 'dev' | 'prod'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['registries-catalog'] })
    },
  })
  const [confirming, setConfirming] = useState(false)

  function startClear() {
    if (!hasContent) return
    setConfirming(true)
  }
  function cancelClear() {
    setConfirming(false)
  }
  async function confirmClear() {
    setConfirming(false)
    clearMut.mutate()
  }

  return (
    <div className="bg-surface border border-border rounded p-1.5">
      <div className="flex items-center justify-between mb-1">
        <span className="flex items-center gap-1.5">
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${
              isOnline ? 'bg-ok' : 'bg-err'
            }`}
          />
          <span className="text-[11px] font-semibold uppercase tracking-wider">
            registry-{reg.name}
          </span>
          {reg.host_url && (
            <a
              href={`${reg.host_url}/v2/_catalog`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] font-mono text-muted hover:text-text hover:underline"
            >
              {reg.host_url.replace(/^https?:\/\//, '')} ↗
            </a>
          )}
        </span>
        <span className="flex items-center gap-2">
          <span className="text-[10px] text-faint">
            {isOnline
              ? `${reg.images.length} image${reg.images.length === 1 ? '' : 's'} · ${totalTags} tag${totalTags === 1 ? '' : 's'}`
              : 'offline'}
          </span>
          {(reg.name === 'dev' || reg.name === 'prod') && (
            <button
              type="button"
              onClick={startClear}
              disabled={!hasContent || clearMut.isPending || confirming}
              className="text-[10px] text-muted hover:text-err border border-border rounded px-1.5 py-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
              title={
                hasContent
                  ? `Stop registry-${reg.name}, drop its data volume, and restart it empty`
                  : 'Already empty'
              }
              data-testid={`registry-clear-${reg.name}`}
            >
              {clearMut.isPending ? 'clearing…' : 'clear'}
            </button>
          )}
        </span>
      </div>
      {confirming && (
        <div className="mb-1.5 rounded border border-warn/50 bg-warn/10 p-1.5 space-y-1">
          <p className="text-[10px] text-warn">
            Wipe registry-{reg.name}? This stops the container, removes its data
            volume, and restarts it empty. {totalTags} tag{totalTags === 1 ? '' : 's'} will be lost.
          </p>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={confirmClear}
              className="text-[10px] bg-err/15 text-err border border-err/50 rounded px-2 py-0.5 hover:bg-err/25"
              data-testid={`registry-clear-confirm-${reg.name}`}
            >
              Yes, wipe it
            </button>
            <button
              type="button"
              onClick={cancelClear}
              className="text-[10px] text-muted border border-border rounded px-2 py-0.5 hover:text-text"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {clearMut.isError && (
        <p className="text-[10px] text-err mb-1 whitespace-pre-wrap">
          Clear failed: {extractClearError(clearMut.error)}
        </p>
      )}
      {!isOnline && (
        <p className="text-[10px] text-faint italic">
          Registry is not reachable right now. It comes up with the lab via{' '}
          <code className="font-mono">make small</code> or{' '}
          <code className="font-mono">docker compose up -d registry-{reg.name}</code>.
        </p>
      )}
      {isOnline && reg.images.length === 0 && (
        <p className="text-[10px] text-faint italic">
          Empty. The first <code className="font-mono">build_image</code> push lands here.
        </p>
      )}
      {isOnline && reg.images.length > 0 && (
        <ul className="space-y-0.5">
          {reg.images.map((img) => (
            <li key={img.name} className="text-[11px] font-mono">
              <span className="text-text">{img.name}</span>
              {img.tags.length > 0 && (
                <span className="text-faint">: </span>
              )}
              <span className="inline-flex flex-wrap gap-1">
                {img.tags.map((tag) => {
                  const key = `${img.name}:${tag}`
                  const isFresh = flashing.has(key)
                  return (
                    <span
                      key={tag}
                      className={`inline-block px-1 py-0.5 text-[10px] rounded border transition-colors ${
                        isFresh
                          ? 'bg-ok/20 border-ok text-ok animate-pulse'
                          : 'bg-bg border-border text-muted'
                      }`}
                      title={isFresh ? 'just appeared' : `${img.name}:${tag}`}
                      data-testid={`registry-tag-${reg.name}-${img.name}-${tag}`}
                    >
                      {tag}
                    </span>
                  )
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Synthetic OTHER tools (list_mcp_servers, enable_mcp_tools) don't belong to
// any MCP server — they're handled inside chat-ui itself. Render them as a
// statically-expanded card at the bottom of the panel so they're always
// visible without a toggle.
function OtherToolsRow({
  tools,
  onToolClick,
}: {
  tools: ToolDef[]
  onToolClick: (t: ToolDef) => void
}) {
  return (
    <div className="bg-surface-2 border border-border rounded-md text-sm">
      <div className="flex items-center justify-between px-2.5 py-2">
        <span className="flex items-center gap-2">
          <span className="w-4 text-center text-faint select-none leading-none">·</span>
          <span className="inline-flex items-center justify-center w-4 text-[10px] font-bold text-muted">
            ⚙
          </span>
          <span className="text-muted">other</span>
        </span>
        <span className="text-xs text-faint">
          {tools.length} synthetic tool{tools.length === 1 ? '' : 's'}
        </span>
      </div>
      <ToolList category="OTHER" tools={tools} onToolClick={onToolClick} />
    </div>
  )
}
