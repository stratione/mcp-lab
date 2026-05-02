/// <reference types="node" />
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sendChat, getMcpStatus, setProvider, setHallucinationMode, probeUrl, mcpControl } from './api'

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

  it('POSTs /api/probe with {url} and returns ProbeResult', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ status: 200, body: [{ id: 1 }] }), { status: 200 })
    )
    vi.stubGlobal('fetch', fetchMock)
    const r = await probeUrl('http://localhost:8001/users')
    expect(fetchMock).toHaveBeenCalledOnce()
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(JSON.parse(init.body as string)).toEqual({ url: 'http://localhost:8001/users' })
    expect(r.status).toBe(200)
  })

  it('POSTs /api/mcp-control with service+action', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ ok: true, service: 'mcp-user', action: 'start' }), { status: 200 })
    )
    vi.stubGlobal('fetch', fetchMock)
    await mcpControl('mcp-user', 'start')
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(JSON.parse(init.body as string)).toEqual({ service: 'mcp-user', action: 'start' })
  })
})
