import { describe, it, expect } from 'vitest'
import { LESSONS, PHASE_COUNT } from './lessons'

describe('LESSONS config', () => {
  it('lists the four read-side MCPs in workshop order', () => {
    expect(LESSONS.map((l) => l.mcp)).toEqual([
      'mcp-user',
      'mcp-gitea',
      'mcp-registry',
      'mcp-promotion',
    ])
  })

  it('every lesson has a prompt, probe URL, and one-line teach', () => {
    for (const l of LESSONS) {
      expect(l.prompt.length).toBeGreaterThan(10)
      expect(l.probe.url).toMatch(/^http:\/\/localhost:\d+/)
      expect(l.teach.length).toBeGreaterThan(10)
    }
  })

  it('PHASE_COUNT counts intro + cold-open + 3 cards per MCP + capstone + wrap', () => {
    // 1 (welcome) + 1 (cold-open) + 4*3 (per-MCP) + 1 (capstone) + 1 (wrap) = 16
    expect(PHASE_COUNT).toBe(16)
  })
})
