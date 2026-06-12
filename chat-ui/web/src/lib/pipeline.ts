// Pipeline Board domain logic (contract §5) — kept out of the component file
// so it can be unit-tested and shared without tripping react-refresh's
// only-export-components rule.
import type { PipelineState, RegistrySection } from './api'

export type StageId =
  | 'commit'
  | 'ci'
  | 'registry-dev'
  | 'scan'
  | 'staging'
  | 'prod'
  | 'deployed'

export const STAGES: { id: StageId; label: string }[] = [
  { id: 'commit', label: 'commit' },
  { id: 'ci', label: 'CI' },
  { id: 'registry-dev', label: 'registry-dev' },
  { id: 'scan', label: 'scan' },
  { id: 'staging', label: 'staging' },
  { id: 'prod', label: 'prod' },
  { id: 'deployed', label: 'deployed' },
]

export type StageStatus = 'gray' | 'blue' | 'green' | 'red'

// Latest-first defensive sort: the backend promises newest first but we
// don't bet the node color on it.
function latestBy<T>(items: T[], key: (t: T) => string): T | undefined {
  if (items.length === 0) return undefined
  return [...items].sort((a, b) => key(b).localeCompare(key(a)))[0]
}

function registryHasImages(r: RegistrySection): boolean {
  return r.status === 'ok' && r.images.length > 0
}

// Node color derivation (contract §5):
// gray = offline/unknown, blue (pulse) = running, green = ok, red = failed.
export function deriveStageStatuses(state: PipelineState | undefined): Record<StageId, StageStatus> {
  const s: Record<StageId, StageStatus> = {
    commit: 'gray',
    ci: 'gray',
    'registry-dev': 'gray',
    scan: 'gray',
    staging: 'gray',
    prod: 'gray',
    deployed: 'gray',
  }
  if (!state) return s

  // commit: ok if the section is ok
  if (state.commit.status === 'ok') s.commit = 'green'

  // CI: red if latest run failed, blue while running/waiting, green on success
  if (state.ci.status === 'ok' && state.ci.runs.length > 0) {
    const latest = latestBy(state.ci.runs, (r) => r.created) ?? state.ci.runs[0]
    if (latest.status === 'failure') s.ci = 'red'
    else if (latest.status === 'success') s.ci = 'green'
    else if (latest.status === 'running' || latest.status === 'waiting') s.ci = 'blue'
  }

  // registry nodes: green if any image is present
  if (registryHasImages(state.registries.dev)) s['registry-dev'] = 'green'
  if (registryHasImages(state.registries.staging)) s.staging = 'green'
  if (registryHasImages(state.registries.prod)) s.prod = 'green'

  // scan: red if the latest scan failed, green if it passed
  if (state.scans.status === 'ok' && state.scans.items.length > 0) {
    const latest = latestBy(state.scans.items, (i) => i.created_at) ?? state.scans.items[0]
    s.scan = latest.passed ? 'green' : 'red'
  }

  // deployed: green if any deployment is running
  if (
    state.deployments.status === 'ok' &&
    state.deployments.items.some((d) => d.state === 'running')
  ) {
    s.deployed = 'green'
  }

  return s
}

export function timeAgo(iso: string): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return iso
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000))
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}
