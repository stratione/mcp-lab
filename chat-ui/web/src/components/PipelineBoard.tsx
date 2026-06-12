// Pipeline Board — full-screen live view of the lab's CI/CD pipeline
// (contract §5). Top: a horizontal stage flow commit → CI → registry-dev →
// scan → staging → prod → deployed, each node colored by status derived from
// GET /api/pipeline/state (polled every 4 s while the board is open — the
// queries live in BoardBody which only mounts while the dialog is open, so
// closing the board stops polling). Clicking a node opens a right-hand
// detail drawer; the bottom strip is a live event feed from GET /api/events.
//
// No new npm dependencies: custom flex/SVG-free layout on the existing
// shadcn dialog + tailwind theme tokens.
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { HelpTip } from '@/components/HelpTip'
import { Skeleton } from '@/components/ui/skeleton'
import { STAGE_HELP, SOURCE_HELP, STATUS_LEGEND } from '@/lib/help'
import { cn } from '@/lib/utils'
import {
  getEvents,
  getPipelineState,
  type DeploymentItem,
  type PipelineEvent,
  type PipelineState,
  type PromotionItem,
  type ScanItem,
} from '@/lib/api'
import {
  STAGES,
  deriveStageStatuses,
  timeAgo,
  type StageId,
  type StageStatus,
} from '@/lib/pipeline'

// ── Small helpers ───────────────────────────────────────────────────────────

const shortSha = (sha: string) => (sha.length > 10 ? sha.slice(0, 10) : sha)

// Friendly hints for offline/empty sections — actionable commands, not just
// "unavailable".
const HINTS = {
  ci: 'CI offline — start it with: docker compose --profile ci up -d act-runner',
  ciEmpty:
    'No CI runs yet — push a commit to mcpadmin/sample-app with a .gitea/workflows/ci.yml to trigger one.',
  commit: 'Gitea unreachable — start it with: docker compose up -d gitea',
  registry: (name: string) =>
    `registry-${name} offline — start it with: docker compose up -d registry-${name}`,
  scans:
    'Scan history unavailable — is promotion-service running? Try: docker compose up -d promotion-service',
  scansEmpty:
    'No scans recorded yet — run one with: labctl scan hello-app:latest (the Trivy server starts with: docker compose --profile security up -d trivy)',
  promotions:
    'Promotion history unavailable — is promotion-service running? Try: docker compose up -d promotion-service',
  promotionsEmpty: 'No promotions yet — promote with: labctl promote hello-app:latest --to staging',
  deployments: 'Deployments unavailable — the chat-ui backend could not reach the container engine.',
  deploymentsEmpty: 'Nothing deployed yet — deploy with: labctl deploy hello-app:latest --env dev',
  events: 'Event feed unavailable — events appear here as CI runs, scans, and promotions happen.',
} as const

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs text-muted bg-surface-2 border border-border rounded-md px-3 py-2 leading-relaxed font-mono">
      {children}
    </div>
  )
}

function Chip({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center text-[10px] uppercase tracking-wider border rounded px-1.5 py-0.5 whitespace-nowrap',
        className,
      )}
    >
      {children}
    </span>
  )
}

const CI_CHIP: Record<string, string> = {
  success: 'bg-ok/15 text-ok border-ok/40',
  failure: 'bg-err/15 text-err border-err/40',
  running: 'bg-blue-500/15 text-blue-300 border-blue-500/40 animate-pulse',
  waiting: 'bg-surface-2 text-muted border-border',
}

const SOURCE_BADGE: Record<string, string> = {
  gitea: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  runner: 'bg-blue-500/15 text-blue-300 border-blue-500/40',
  scan: 'bg-purple-500/15 text-purple-300 border-purple-500/40',
  promotion: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  deploy: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
  manual: 'bg-surface-2 text-muted border-border',
}

// Severity chips: crit red / high orange / med yellow / low gray.
function SeverityChips({ scan }: { scan: ScanItem }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Chip className="bg-red-500/15 text-red-400 border-red-500/40">crit {scan.critical}</Chip>
      <Chip className="bg-orange-500/15 text-orange-400 border-orange-500/40">high {scan.high}</Chip>
      <Chip className="bg-yellow-500/15 text-yellow-400 border-yellow-500/40">med {scan.medium}</Chip>
      <Chip className="bg-surface-2 text-muted border-border">low {scan.low}</Chip>
    </span>
  )
}

// ── Stage flow strip ────────────────────────────────────────────────────────

const NODE_STYLE: Record<StageStatus, { dot: string; box: string }> = {
  gray: { dot: 'bg-faint', box: 'border-border text-muted' },
  blue: { dot: 'bg-blue-400 animate-pulse', box: 'border-blue-400/60 text-text' },
  green: { dot: 'bg-emerald-400', box: 'border-emerald-500/60 text-text' },
  red: { dot: 'bg-red-400', box: 'border-red-500/60 text-text' },
}

const STATUS_WORD: Record<StageStatus, string> = {
  gray: 'offline / unknown',
  blue: 'running',
  green: 'ok',
  red: 'failed',
}

function Connector() {
  return (
    <div aria-hidden className="flex-1 min-w-3 flex items-center">
      <div className="h-px flex-1 bg-border" />
      <span className="text-faint text-[10px] leading-none -ml-0.5">▸</span>
    </div>
  )
}

function StageFlow({
  statuses,
  selected,
  onSelect,
}: {
  statuses: Record<StageId, StageStatus>
  selected: StageId | null
  onSelect: (id: StageId) => void
}) {
  return (
    <div className="flex items-center gap-1 px-5 py-4 border-b border-border overflow-x-auto shrink-0">
      {STAGES.map((stage, i) => {
        const style = NODE_STYLE[statuses[stage.id]]
        return (
          <div key={stage.id} className="flex items-center flex-1 min-w-0">
            {i > 0 && <Connector />}
            <HelpTip
              side="bottom"
              title={`${stage.label} — ${STATUS_WORD[statuses[stage.id]]}`}
              body={STAGE_HELP[stage.id]}
            >
              <button
                type="button"
                onClick={() => onSelect(stage.id)}
                data-testid={`pipeline-node-${stage.id}`}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-lg border bg-surface px-3 py-2 min-w-[88px] hover:bg-surface-2 transition-colors duration-500',
                  style.box,
                  selected === stage.id && 'ring-1 ring-text/40 bg-surface-2',
                )}
              >
                <span className={cn('h-2.5 w-2.5 rounded-full transition-colors duration-500', style.dot)} />
                <span className="text-xs whitespace-nowrap">{stage.label}</span>
              </button>
            </HelpTip>
          </div>
        )
      })}
    </div>
  )
}

// ── Drawer content panels ───────────────────────────────────────────────────

function CommitPanel({ state }: { state: PipelineState }) {
  const c = state.commit
  if (c.status === 'offline') return <Hint>{HINTS.commit}</Hint>
  const repoUrl = `http://localhost:3000/${c.repo || 'mcpadmin/sample-app'}`
  return (
    <div className="space-y-3 text-sm">
      <div className="font-mono text-xs text-muted">{shortSha(c.sha)}</div>
      <div className="text-text">{c.message || '(no commit message)'}</div>
      <div className="text-xs text-muted">
        by <span className="text-text">{c.author || 'unknown'}</span>
        {c.when ? ` · ${timeAgo(c.when)}` : ''}
      </div>
      <a
        href={repoUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block text-xs text-primary hover:underline"
      >
        Open {c.repo || 'mcpadmin/sample-app'} in Gitea →
      </a>
    </div>
  )
}

function CiPanel({ state }: { state: PipelineState }) {
  const ci = state.ci
  if (ci.status === 'offline') return <Hint>{HINTS.ci}</Hint>
  if (ci.runs.length === 0) return <Hint>{HINTS.ciEmpty}</Hint>
  return (
    <ul className="space-y-2">
      {ci.runs.map((run) => (
        <li
          key={String(run.id)}
          className="border border-border rounded-md bg-surface-2/50 px-3 py-2 space-y-1"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-text truncate">{run.title || `run #${String(run.id)}`}</span>
            <Chip className={CI_CHIP[run.status] ?? CI_CHIP.waiting}>{run.status}</Chip>
          </div>
          <div className="text-[11px] text-muted font-mono">
            {run.event || 'push'} · {shortSha(run.head_sha)}
            {run.created ? ` · ${timeAgo(run.created)}` : ''}
          </div>
        </li>
      ))}
    </ul>
  )
}

// Three-column dev | staging | prod image:tags table — a promotion is visible
// as an artifact appearing in the next column. `highlight` marks the column
// of the clicked node.
function RegistryTable({
  state,
  highlight,
}: {
  state: PipelineState
  highlight: 'dev' | 'staging' | 'prod'
}) {
  const cols = ['dev', 'staging', 'prod'] as const
  const names = new Set<string>()
  for (const col of cols) {
    const r = state.registries[col]
    if (r.status === 'ok') r.images.forEach((img) => names.add(img.name))
  }
  const rows = [...names].sort()

  // Promotion reach per (image, tag): the furthest registry a tag has reached,
  // so a chip can be tinted to show how far through dev → staging → prod it has
  // been promoted — the same tag turns green everywhere once it lands in prod.
  const reach = new Map<string, 'prod' | 'staging' | 'dev'>()
  for (const col of cols) {
    const r = state.registries[col]
    if (r.status !== 'ok') continue
    for (const img of r.images) {
      for (const t of img.tags) {
        const key = `${img.name}@${t}`
        const cur = reach.get(key)
        if (col === 'prod') reach.set(key, 'prod')
        else if (col === 'staging' && cur !== 'prod') reach.set(key, 'staging')
        else if (!cur) reach.set(key, 'dev')
      }
    }
  }
  const tagClass = (name: string, t: string) => {
    switch (reach.get(`${name}@${t}`)) {
      case 'prod':
        return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
      case 'staging':
        return 'bg-amber-500/15 text-amber-300 border-amber-500/40'
      default:
        return 'bg-surface-2 text-muted border-border'
    }
  }

  return (
    <div className="space-y-2">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="text-left text-muted border-b border-border">
            <th className="py-1.5 pr-2 font-normal">image</th>
            {cols.map((col) => (
              <th
                key={col}
                className={cn('py-1.5 px-2 font-normal', col === highlight && 'text-text font-semibold')}
              >
                {col}
                {state.registries[col].status === 'offline' && (
                  <span className="ml-1 text-err">●</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((name) => (
            <tr key={name} className="border-b border-border/50 align-top">
              <td className="py-1.5 pr-2 font-mono text-text">{name}</td>
              {cols.map((col) => {
                const r = state.registries[col]
                const tags =
                  r.status === 'ok' ? (r.images.find((i) => i.name === name)?.tags ?? []) : []
                return (
                  <td key={col} className={cn('py-1.5 px-2', col === highlight && 'bg-surface-2/60')}>
                    {r.status === 'offline' ? (
                      <span className="text-faint">—</span>
                    ) : tags.length === 0 ? (
                      <span className="text-faint">·</span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {tags.map((t) => (
                          <Chip key={t} className={cn('normal-case transition-colors', tagClass(name, t))}>
                            {t}
                          </Chip>
                        ))}
                      </span>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="py-3">
                <Hint>
                  No images in any registry yet — a successful CI run pushes hello-app to registry-dev.
                </Hint>
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-faint">
          <span className="uppercase tracking-wider">promoted to:</span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-400" /> prod
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-amber-400" /> staging
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-faint" /> dev only
          </span>
        </div>
      )}
      {state.registries[highlight].status === 'offline' && <Hint>{HINTS.registry(highlight)}</Hint>}
    </div>
  )
}

function ScanPanel({ state }: { state: PipelineState }) {
  const scans = state.scans
  if (scans.status === 'offline') return <Hint>{HINTS.scans}</Hint>
  if (scans.items.length === 0) return <Hint>{HINTS.scansEmpty}</Hint>
  const latest = [...scans.items].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  return (
    <div className="space-y-3">
      {/* pass/fail banner for the most recent scan */}
      <div
        className={cn(
          'rounded-md border px-3 py-2 text-xs font-semibold',
          latest.passed
            ? 'bg-ok/10 text-ok border-ok/40'
            : 'bg-err/10 text-err border-err/40',
        )}
      >
        {latest.passed
          ? `✓ Latest scan passed — ${latest.image_name}:${latest.tag} (${latest.registry})`
          : `✗ Latest scan failed — ${latest.image_name}:${latest.tag} has ${latest.critical} critical CVE${latest.critical === 1 ? '' : 's'}`}
      </div>
      <ul className="space-y-2">
        {scans.items.map((scan) => (
          <li
            key={String(scan.id)}
            className="border border-border rounded-md bg-surface-2/50 px-3 py-2 space-y-1.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-mono text-text truncate">
                {scan.image_name}:{scan.tag}{' '}
                <span className="text-muted">({scan.registry})</span>
              </span>
              <Chip
                className={
                  scan.passed ? 'bg-ok/15 text-ok border-ok/40' : 'bg-err/15 text-err border-err/40'
                }
              >
                {scan.passed ? 'pass' : 'fail'}
              </Chip>
            </div>
            <SeverityChips scan={scan} />
            <div className="text-[11px] text-muted">
              by {scan.scanned_by || 'unknown'}
              {scan.created_at ? ` · ${timeAgo(scan.created_at)}` : ''}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Audit timeline — who promoted what when, including rollbacks.
function PromotionsTimeline({ state }: { state: PipelineState }) {
  const promos = state.promotions
  if (promos.status === 'offline') return <Hint>{HINTS.promotions}</Hint>
  if (promos.items.length === 0) return <Hint>{HINTS.promotionsEmpty}</Hint>
  return (
    <ul className="space-y-0">
      {promos.items.map((p: PromotionItem, i) => {
        const rollback = p.action === 'rollback'
        const failed = p.status && p.status !== 'success'
        return (
          <li key={String(p.id)} className="relative pl-5 pb-3">
            {/* timeline rail */}
            {i < (promos.items.length ?? 0) - 1 && (
              <span aria-hidden className="absolute left-[5px] top-3 bottom-0 w-px bg-border" />
            )}
            <span
              aria-hidden
              className={cn(
                'absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full border',
                rollback
                  ? 'bg-amber-400/80 border-amber-400'
                  : failed
                    ? 'bg-red-400/80 border-red-400'
                    : 'bg-emerald-400/80 border-emerald-400',
              )}
            />
            <div className="flex items-center gap-2 flex-wrap">
              <Chip
                className={
                  rollback
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                    : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                }
              >
                {rollback ? 'rollback' : 'promote'}
              </Chip>
              <span className="text-xs text-text font-mono">
                {p.image_name}:{p.tag}
              </span>
              {failed && <Chip className="bg-err/15 text-err border-err/40">{p.status}</Chip>}
            </div>
            <div className="text-[11px] text-muted mt-0.5">
              {p.from_registry && p.to_registry
                ? `${p.from_registry} → ${p.to_registry}`
                : (p.to_registry ?? '')}{' '}
              · by {p.promoted_by || 'unknown'}
              {p.created_at ? ` · ${timeAgo(p.created_at)}` : ''}
            </div>
            {p.detail && <div className="text-[11px] text-faint mt-0.5 break-words">{p.detail}</div>}
          </li>
        )
      })}
    </ul>
  )
}

const ENV_PORT: Record<string, number> = { dev: 9080, staging: 9081, prod: 9082 }

function DeployedPanel({ state }: { state: PipelineState }) {
  const deps = state.deployments
  if (deps.status === 'offline') return <Hint>{HINTS.deployments}</Hint>
  if (deps.items.length === 0) return <Hint>{HINTS.deploymentsEmpty}</Hint>
  return (
    <ul className="space-y-2">
      {deps.items.map((d: DeploymentItem) => {
        const port = d.port ?? ENV_PORT[d.env]
        return (
          <li
            key={d.name || `${d.env}-${d.image}`}
            className="border border-border rounded-md bg-surface-2/50 px-3 py-2 space-y-1"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-mono text-text truncate">{d.name}</span>
              <Chip
                className={
                  d.state === 'running'
                    ? 'bg-ok/15 text-ok border-ok/40'
                    : 'bg-surface-2 text-muted border-border'
                }
              >
                {d.state || 'unknown'}
              </Chip>
            </div>
            <div className="text-[11px] text-muted font-mono truncate">
              {d.image} · env={d.env}
            </div>
            {port != null && (
              <a
                href={`http://localhost:${port}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-primary hover:underline font-mono"
              >
                http://localhost:{port} →
              </a>
            )}
          </li>
        )
      })}
    </ul>
  )
}

const DRAWER_TITLE: Record<StageId, string> = {
  commit: 'Latest commit',
  ci: 'CI runs',
  'registry-dev': 'Registries — dev',
  scan: 'Vulnerability scans',
  staging: 'Registries — staging',
  prod: 'Registries — prod',
  deployed: 'Deployments',
}

function Drawer({
  stage,
  state,
  onClose,
}: {
  stage: StageId
  state: PipelineState | undefined
  onClose: () => void
}) {
  return (
    <aside
      data-testid="pipeline-drawer"
      className="w-[400px] shrink-0 border-l border-border bg-surface flex flex-col min-h-0"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <h3 className="text-sm font-semibold">{DRAWER_TITLE[stage]}</h3>
        <button
          type="button"
          onClick={onClose}
          className="text-muted hover:text-text text-xs border border-border rounded-md px-2 py-1 transition-colors"
          aria-label="Close detail drawer"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {!state ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading details">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : stage === 'commit' ? (
          <CommitPanel state={state} />
        ) : stage === 'ci' ? (
          <CiPanel state={state} />
        ) : stage === 'registry-dev' ? (
          <RegistryTable state={state} highlight="dev" />
        ) : stage === 'scan' ? (
          <ScanPanel state={state} />
        ) : stage === 'staging' || stage === 'prod' ? (
          // Registry view plus the promotion audit timeline — promotions are
          // what move artifacts into these registries (and rollbacks out).
          <div className="space-y-4">
            <RegistryTable state={state} highlight={stage} />
            <div>
              <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                Promotion history
              </h4>
              <PromotionsTimeline state={state} />
            </div>
          </div>
        ) : (
          <DeployedPanel state={state} />
        )}
      </div>
    </aside>
  )
}

// ── Event feed strip ────────────────────────────────────────────────────────

function EventFeed({
  events,
  error,
  loading,
}: {
  events: PipelineEvent[] | undefined
  error: boolean
  loading: boolean
}) {
  return (
    <div className="border-t border-border bg-surface shrink-0 max-h-44 flex flex-col">
      <div className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-wider text-faint shrink-0">
        Event feed
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-2">
        {loading && !events ? (
          <ul className="space-y-1.5 py-1" aria-busy="true" aria-label="Loading events">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex items-center gap-2">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-4 w-14" />
                <Skeleton className="h-3 flex-1" />
              </li>
            ))}
          </ul>
        ) : error || !events ? (
          <div className="text-xs text-muted py-1">{HINTS.events}</div>
        ) : events.length === 0 ? (
          <div className="text-xs text-muted py-1">
            No events yet — push a commit or run a scan and it shows up here.
          </div>
        ) : (
          <ul className="space-y-1">
            {events.map((ev) => (
              <li key={String(ev.id)} className="flex items-baseline gap-2 text-xs">
                <span className="text-faint font-mono w-16 shrink-0 text-right">
                  {timeAgo(ev.received_at)}
                </span>
                <HelpTip
                  side="top"
                  title={`${ev.source} event`}
                  body={SOURCE_HELP[ev.source] ?? SOURCE_HELP.manual}
                >
                  <span className="inline-flex cursor-help">
                    <Chip className={SOURCE_BADGE[ev.source] ?? SOURCE_BADGE.manual}>{ev.source}</Chip>
                  </span>
                </HelpTip>
                <span className="text-text truncate" title={ev.summary}>
                  {ev.summary || ev.type}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ── Legend + live indicator ─────────────────────────────────────────────────

// Re-render on a timer so relative timestamps ("updated 3s ago") tick live
// even between the 4s data refetches.
function useNow(intervalMs: number) {
  const [, force] = useState(0)
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
}

function Legend() {
  return (
    <div className="flex items-center gap-3 text-[11px] text-muted">
      <span className="text-[10px] uppercase tracking-wider text-faint">status</span>
      {STATUS_LEGEND.map((l) => (
        <HelpTip key={l.status} side="bottom" title={l.label} body={l.body}>
          <span
            tabIndex={0}
            className="inline-flex items-center gap-1.5 cursor-help rounded outline-none focus-visible:ring-1 focus-visible:ring-text/40"
          >
            <span className={cn('h-2 w-2 rounded-full', l.dot)} />
            {l.label}
          </span>
        </HelpTip>
      ))}
    </div>
  )
}

function LiveIndicator({ generatedAt, fetching }: { generatedAt?: string; fetching: boolean }) {
  useNow(1000)
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-faint" aria-live="off">
      <span
        aria-hidden
        className={cn('h-1.5 w-1.5 rounded-full bg-emerald-400', fetching && 'animate-pulse')}
      />
      <span className="font-mono">{generatedAt ? `updated ${timeAgo(generatedAt)}` : 'connecting…'}</span>
      <span className="opacity-70">· every 4s</span>
    </div>
  )
}

// ── Board body (mounted only while the dialog is open → polling pauses on
//    close automatically) ───────────────────────────────────────────────────

function BoardBody() {
  const [selected, setSelected] = useState<StageId | null>(null)

  const stateQ = useQuery({
    queryKey: ['pipeline-state'],
    queryFn: ({ signal }) => getPipelineState(signal),
    refetchInterval: 4_000,
    staleTime: 0,
  })
  const eventsQ = useQuery({
    queryKey: ['pipeline-events'],
    queryFn: ({ signal }) => getEvents(30, signal),
    refetchInterval: 4_000,
    staleTime: 0,
  })

  const state = stateQ.data
  const statuses = deriveStageStatuses(state)
  // Prefer the dedicated /api/events query; fall back to the events section
  // bundled in the pipeline state if it errors.
  const events =
    eventsQ.data ?? (state?.events.status === 'ok' ? state.events.items : undefined)

  const offlineHints: string[] = []
  if (state) {
    if (state.ci.status === 'offline') offlineHints.push(HINTS.ci)
    if (state.commit.status === 'offline') offlineHints.push(HINTS.commit)
    if (state.registries.staging.status === 'offline') offlineHints.push(HINTS.registry('staging'))
    if (state.scans.status === 'offline') offlineHints.push(HINTS.scans)
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex items-center justify-between gap-3 px-5 py-2 border-b border-border shrink-0">
        <Legend />
        <LiveIndicator generatedAt={state?.generated_at} fetching={stateQ.isFetching} />
      </div>
      <StageFlow
        statuses={statuses}
        selected={selected}
        onSelect={(id) => setSelected((cur) => (cur === id ? null : id))}
      />
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-3">
            {stateQ.isLoading ? (
              <div className="space-y-3" aria-busy="true" aria-label="Loading pipeline state">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-2/5" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : stateQ.isError ? (
              <Hint>
                Could not reach /api/pipeline/state — is the chat-ui backend up to date? Refresh
                or restart it with: docker compose up -d --build chat-ui
              </Hint>
            ) : (
              <>
                <p className="text-sm text-muted">
                  Click a stage node to inspect details — CI runs, registry contents, scan
                  results, promotion history, and live deployments.
                </p>
                {offlineHints.map((h) => (
                  <Hint key={h}>{h}</Hint>
                ))}
              </>
            )}
          </div>
          <EventFeed
            events={events}
            error={eventsQ.isError && !events}
            loading={eventsQ.isLoading && !events}
          />
        </div>
        {selected && <Drawer stage={selected} state={state} onClose={() => setSelected(null)} />}
      </div>
    </div>
  )
}

// ── Public component ────────────────────────────────────────────────────────

export function PipelineBoard({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="pipeline-board"
        className="max-w-[96vw] w-[96vw] h-[94vh] p-0 gap-0 flex flex-col overflow-hidden bg-bg border-border"
      >
        <DialogHeader className="px-5 py-3 border-b border-border shrink-0 space-y-0">
          <DialogTitle className="text-sm font-semibold">⛓ Pipeline</DialogTitle>
          <DialogDescription className="sr-only">
            Live CI/CD pipeline board: commit, CI, registries, scans, promotions, deployments.
          </DialogDescription>
        </DialogHeader>
        <BoardBody />
      </DialogContent>
    </Dialog>
  )
}
