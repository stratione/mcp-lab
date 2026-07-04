// Structural invariants for the Learn Mode course data. These guard the
// contracts the rail/lesson/progress code relies on — not the prose.
import { describe, expect, it } from 'vitest'
import { LEARN_MODULES, moduleByNum } from './curriculum'

describe('curriculum data', () => {
  it('has exactly 8 modules numbered 1..8 in order', () => {
    expect(LEARN_MODULES.map((m) => m.num)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('step ids are globally unique and prefixed with their module number', () => {
    const ids = LEARN_MODULES.flatMap((m) => m.steps.map((s) => s.id))
    expect(new Set(ids).size).toBe(ids.length)
    for (const m of LEARN_MODULES) {
      for (const s of m.steps) expect(s.id.startsWith(`${m.num}.`)).toBe(true)
    }
  })

  it('every module has a concept step first and at least one hand step', () => {
    for (const m of LEARN_MODULES) {
      expect(m.steps[0].kind).toBe('concept')
      expect(m.steps.some((s) => s.kind === 'hand')).toBe(true)
    }
  })

  it('agent steps carry a prompt; command blocks are non-empty', () => {
    for (const m of LEARN_MODULES) {
      for (const s of m.steps) {
        if (s.kind === 'agent') expect((s.agentPrompt ?? '').length).toBeGreaterThan(0)
        for (const c of s.commands ?? []) expect(c.trim().length).toBeGreaterThan(0)
      }
    }
  })

  it('module 8 raw-MCP curls use the no-slash /mcp path (FastMCP 307s /mcp/)', () => {
    const m8 = moduleByNum(8)
    const cmds = m8.steps.flatMap((s) => s.commands ?? []).join('\n')
    expect(cmds).toContain('http://localhost:8003/mcp')
    expect(cmds).not.toContain('8003/mcp/')
  })

  it('every module states what its check proves', () => {
    for (const m of LEARN_MODULES) expect(m.checkMeans.length).toBeGreaterThan(10)
  })

  it('moduleByNum falls back to module 1 for out-of-range input', () => {
    expect(moduleByNum(42).num).toBe(1)
    expect(moduleByNum(3).num).toBe(3)
  })
})
