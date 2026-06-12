import { describe, it, expect } from 'vitest'
import { deriveStageStatuses, timeAgo } from './pipeline'
import { PipelineStateSchema, type PipelineState } from './api'

// Build a fully-offline state via the schema's per-section fallbacks, then
// overlay the fields a test cares about.
function makeState(overrides: Partial<PipelineState> = {}): PipelineState {
  const base = PipelineStateSchema.parse({})
  return { ...base, ...overrides }
}

describe('PipelineStateSchema resilience', () => {
  it('degrades every section to offline on an empty payload', () => {
    const s = PipelineStateSchema.parse({})
    expect(s.commit.status).toBe('offline')
    expect(s.ci.status).toBe('offline')
    expect(s.registries.dev.status).toBe('offline')
    expect(s.registries.staging.status).toBe('offline')
    expect(s.registries.prod.status).toBe('offline')
    expect(s.scans.status).toBe('offline')
    expect(s.promotions.status).toBe('offline')
    expect(s.deployments.status).toBe('offline')
    expect(s.events.status).toBe('offline')
  })

  it('degrades a single malformed section without losing the rest', () => {
    const s = PipelineStateSchema.parse({
      commit: { status: 'ok', repo: 'mcpadmin/sample-app', sha: 'abc', message: 'm', author: 'a', when: '' },
      ci: { status: 'bogus' },
    })
    expect(s.commit.status).toBe('ok')
    expect(s.ci.status).toBe('offline')
  })
})

describe('deriveStageStatuses', () => {
  it('is all gray with no data', () => {
    const st = deriveStageStatuses(undefined)
    expect(Object.values(st).every((v) => v === 'gray')).toBe(true)
  })

  it('commit goes green when the section is ok', () => {
    const st = deriveStageStatuses(
      makeState({
        commit: { status: 'ok', repo: 'mcpadmin/sample-app', sha: 'abc', message: '', author: '', when: '' },
      }),
    )
    expect(st.commit).toBe('green')
  })

  it('CI reflects the latest run: failure → red, running → blue, success → green', () => {
    const run = (status: string, created: string) => ({
      id: 1, title: 'CI', status, event: 'push', head_sha: 'abc', created,
    })
    const ci = (status: string) =>
      deriveStageStatuses(
        makeState({
          ci: { status: 'ok', runs: [run('success', '2026-01-01'), run(status, '2026-01-02')] },
        }),
      ).ci
    expect(ci('failure')).toBe('red')
    expect(ci('running')).toBe('blue')
    expect(ci('waiting')).toBe('blue')
    expect(ci('success')).toBe('green')
  })

  it('registry nodes go green when any image is present', () => {
    const st = deriveStageStatuses(
      makeState({
        registries: {
          dev: { status: 'ok', images: [{ name: 'hello-app', tags: ['latest'] }] },
          staging: { status: 'ok', images: [] },
          prod: { status: 'offline' },
        },
      }),
    )
    expect(st['registry-dev']).toBe('green')
    expect(st.staging).toBe('gray')
    expect(st.prod).toBe('gray')
  })

  it('scan node tracks the latest scan pass/fail', () => {
    const scan = (passed: boolean, created_at: string) => ({
      id: 1, image_name: 'hello-app', tag: 'latest', registry: 'dev', scanned_by: 'labctl',
      critical: passed ? 0 : 3, high: 0, medium: 0, low: 0, total: 3, passed, created_at,
    })
    const failedLatest = makeState({
      scans: { status: 'ok', items: [scan(false, '2026-01-02'), scan(true, '2026-01-01')] },
    })
    const passedLatest = makeState({
      scans: { status: 'ok', items: [scan(true, '2026-01-02'), scan(false, '2026-01-01')] },
    })
    expect(deriveStageStatuses(failedLatest).scan).toBe('red')
    expect(deriveStageStatuses(passedLatest).scan).toBe('green')
  })

  it('deployed goes green only when something is running', () => {
    const dep = (state: string) =>
      makeState({
        deployments: {
          status: 'ok',
          items: [{ name: 'mcp-lab-app-dev', image: 'hello-app', env: 'dev', port: 9080, state }],
        },
      })
    expect(deriveStageStatuses(dep('running')).deployed).toBe('green')
    expect(deriveStageStatuses(dep('exited')).deployed).toBe('gray')
  })
})

describe('timeAgo', () => {
  it('formats seconds/minutes/hours', () => {
    const now = Date.now()
    expect(timeAgo(new Date(now - 5_000).toISOString())).toBe('5s ago')
    expect(timeAgo(new Date(now - 3 * 60_000).toISOString())).toBe('3m ago')
    expect(timeAgo(new Date(now - 2 * 3_600_000).toISOString())).toBe('2h ago')
  })
  it('passes through unparseable input and empty strings', () => {
    expect(timeAgo('')).toBe('')
    expect(timeAgo('not-a-date')).toBe('not-a-date')
  })
})
