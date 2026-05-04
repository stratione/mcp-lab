import { describe, it, expect } from 'vitest'
import { STEPS, PHASES, PHASE_COUNT, phaseFor } from './lessons'

const ALL_TOOLS = [
  // mcp-user
  'list_users', 'list_roles', 'get_user', 'create_user', 'update_user',
  // mcp-gitea
  'list_gitea_repos', 'get_gitea_repo', 'get_gitea_file', 'list_gitea_branches',
  'create_gitea_repo', 'create_gitea_branch', 'create_gitea_file',
  // mcp-runner
  'build_image', 'scan_image', 'deploy_app',
  // mcp-registry
  'list_registries', 'list_registry_images', 'list_image_tags',
  'get_image_manifest', 'tag_image',
  // mcp-promotion
  'promote_image', 'list_promotions', 'get_promotion_status',
] as const

describe('STEPS / PHASES config', () => {
  it('has 9 phases in SDLC order', () => {
    expect(PHASES.map((p) => p.id)).toEqual([
      'cold-open',
      'identity',
      'source-control',
      'build-scan',
      'registry',
      'promotion',
      'deploy',
      'iterate',
      'wrap',
    ])
  })

  it('PHASE_COUNT matches the flat STEPS length and is the 35-step full SDLC', () => {
    expect(PHASE_COUNT).toBe(STEPS.length)
    expect(PHASE_COUNT).toBe(35)
  })

  it('every named MCP tool gets at least one exercise or verify step', () => {
    const exercisedTools = new Set<string>()
    for (const s of STEPS) {
      if (s.kind === 'exercise' || s.kind === 'verify') {
        // tool field is sometimes "build_image + deploy_app" — split on +
        s.tool.split('+').map((t) => t.trim()).forEach((t) => exercisedTools.add(t))
      }
    }
    for (const tool of ALL_TOOLS) {
      expect(
        exercisedTools.has(tool),
        `expected tool "${tool}" to be exercised in some step`,
      ).toBe(true)
    }
  })

  it('verify steps have a probe URL and teach line', () => {
    for (const s of STEPS) {
      if (s.kind === 'verify') {
        expect(s.probe.url).toMatch(/^http:\/\/localhost:\d+/)
        expect(s.teach.length).toBeGreaterThan(10)
        expect(s.prompt.length).toBeGreaterThan(10)
      }
    }
  })

  it('each phase opens with an enable card or contains only opening/closing kinds', () => {
    for (const p of PHASES) {
      // Cold-open + wrap don't enable anything.
      if (p.id === 'cold-open' || p.id === 'wrap' || p.id === 'deploy' || p.id === 'iterate') continue
      expect(
        p.steps[0].kind,
        `phase "${p.id}" should start with an enable card`,
      ).toBe('enable')
    }
  })

  it('phaseFor maps step indices back to their containing phase', () => {
    expect(phaseFor(0).id).toBe('cold-open')
    expect(phaseFor(2).id).toBe('identity')
    expect(phaseFor(STEPS.length - 1).id).toBe('wrap')
  })
})
