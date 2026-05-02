import { describe, it, expect } from 'vitest'
import {
  ChatResponseSchema,
  McpStatusSchema,
  ProvidersResponseSchema,
  ToolsResponseSchema,
  HallucinationStateSchema,
} from './schemas'

describe('zod schemas', () => {
  it('parses a valid ChatResponse', () => {
    const valid = {
      reply: 'hello',
      tool_calls: [{ name: 'list_users', arguments: {}, result: '[]' }],
      token_usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 },
      confidence: { score: 0.9, label: 'High', source: 'heuristic', details: '' },
      hallucination_mode: false,
    }
    expect(() => ChatResponseSchema.parse(valid)).not.toThrow()
  })

  it('rejects a ChatResponse missing reply', () => {
    expect(() => ChatResponseSchema.parse({ tool_calls: [] })).toThrow()
  })

  it('parses an McpStatus list', () => {
    const valid = [{ name: 'gitea', status: 'online', port: 3000, latency_ms: 12 }]
    expect(() => McpStatusSchema.parse(valid)).not.toThrow()
  })

  it('parses HallucinationState', () => {
    expect(() => HallucinationStateSchema.parse({ enabled: true })).not.toThrow()
  })

  it('parses ProvidersResponse', () => {
    expect(() => ProvidersResponseSchema.parse({ providers: ['ollama'], current: 'ollama' })).not.toThrow()
  })

  it('parses ToolsResponse', () => {
    const valid = { tools: [{ name: 'list_users', description: 'x', inputSchema: { type: 'object', properties: {} } }] }
    expect(() => ToolsResponseSchema.parse(valid)).not.toThrow()
  })
})
