/// <reference types="node" />
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sendChat, getMcpStatus, setProvider, setHallucinationMode } from './api'

describe('api client', () => {
  beforeEach(() => {
    global.fetch = vi.fn()
  })

  it('POSTs /api/chat with body and parses response', async () => {
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        reply: 'hi',
        tool_calls: [],
        token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
        confidence: { score: 0.5, label: 'Medium', source: 'heuristic', details: '' },
        hallucination_mode: false,
      }),
    })
    const res = await sendChat({ message: 'hello', history: [] })
    expect(res.reply).toBe('hi')
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/chat',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('GETs /api/mcp-status and returns flat array of servers from envelope', async () => {
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        servers: [{ name: 'gitea', status: 'online', port: 3000 }],
        total_tools: 7,
        online_count: 1,
        engine: 'docker',
      }),
    })
    const res = await getMcpStatus()
    expect(res).toBeInstanceOf(Array)
    expect(res[0].name).toBe('gitea')
  })

  it('throws ApiError when response shape is invalid', async () => {
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ unexpected: true }),
    })
    await expect(sendChat({ message: 'x', history: [] })).rejects.toThrow(/shape/)
  })

  it('POSTs /api/provider', async () => {
    ;(global.fetch as any).mockResolvedValue({ ok: true, json: async () => ({}) })
    await setProvider({ provider: 'ollama', model: 'llama3.1' })
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/provider',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('POSTs /api/hallucination-mode', async () => {
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ enabled: true }),
    })
    const r = await setHallucinationMode(true)
    expect(r.enabled).toBe(true)
  })
})
