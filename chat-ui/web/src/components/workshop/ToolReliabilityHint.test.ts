import { describe, it, expect } from 'vitest'
import { __test } from './ToolReliabilityHint'

const { isLikelySmallOllamaModel, shouldShow } = __test

// The hint exists to warn about ONE specific failure mode: small local
// llama-family models that emit tool calls as raw JSON. Showing it for any
// other configuration is noise; hiding it for small models is the bug we're
// trying to prevent.
describe('isLikelySmallOllamaModel', () => {
  it('treats common small ollama tags as small', () => {
    expect(isLikelySmallOllamaModel('llama3.1:8b')).toBe(true)
    expect(isLikelySmallOllamaModel('llama3.2:3b')).toBe(true)
    expect(isLikelySmallOllamaModel('mistral:7b')).toBe(true)
    expect(isLikelySmallOllamaModel('qwen2.5:7b')).toBe(true)
  })

  it('treats bare model names without size as small (default tag is small)', () => {
    expect(isLikelySmallOllamaModel('llama3.1')).toBe(true)
    expect(isLikelySmallOllamaModel('mistral')).toBe(true)
  })

  it('does NOT flag large variants', () => {
    expect(isLikelySmallOllamaModel('llama3.1:70b')).toBe(false)
    expect(isLikelySmallOllamaModel('llama3.1:405b')).toBe(false)
    expect(isLikelySmallOllamaModel('mistral-large')).toBe(false)
    expect(isLikelySmallOllamaModel('qwen2.5:72b')).toBe(false)
  })

  it('treats unknown empty model as small (defensive — better to over-warn than miss)', () => {
    expect(isLikelySmallOllamaModel('')).toBe(true)
  })
})

describe('shouldShow', () => {
  it('shows ONLY for ollama with a small model', () => {
    expect(shouldShow('ollama', 'llama3.1:8b')).toBe(true)
    expect(shouldShow('ollama', 'llama3.1:70b')).toBe(false)
  })

  it('hides for API LLMs regardless of model name (their tool-calling is reliable)', () => {
    expect(shouldShow('openai', 'gpt-4o')).toBe(false)
    expect(shouldShow('anthropic', 'claude-sonnet-4-5-20250929')).toBe(false)
    expect(shouldShow('google', 'gemini-2.0-flash')).toBe(false)
    expect(shouldShow('pretend', 'demo')).toBe(false)
  })

  it('hides even with no model when provider is non-ollama', () => {
    expect(shouldShow('openai', '')).toBe(false)
    expect(shouldShow('anthropic', '')).toBe(false)
  })
})
