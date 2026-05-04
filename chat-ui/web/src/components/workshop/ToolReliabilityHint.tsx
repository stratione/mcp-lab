import { useEffect, useState } from 'react'
import { loadSettings } from '@/lib/settings'

// Tiny inline hint that warns about a known failure mode of small local
// models: they often emit tool calls as raw JSON text in their reply rather
// than actually invoking the tool. First-time attendees see "JSON garbage"
// and assume the workshop is broken — this hint reframes it so they know
// it's a model limitation, not a wiring problem.
//
// Provider-aware: API LLMs (OpenAI, Anthropic, Google) have reliable
// function-calling, so we hide the hint for them. Likewise the Pretend
// provider (no real LLM at all) and large Ollama models. The hint only
// appears in the configuration where it actually applies.

// Threshold (in billions of params) above which we trust an Ollama model's
// tool-calling. 30B is roughly where local llama-family models start producing
// reliable function calls in our testing.
const LARGE_PARAM_THRESHOLD_B = 30

function isLikelySmallOllamaModel(model: string): boolean {
  if (!model) return true  // unknown defaults to "show the hint"
  if (model === 'auto') return true  // auto resolves server-side; assume small until proven otherwise

  // Explicit size words always win.
  if (/(?:^|[-:])large\b/i.test(model)) return false
  if (/(?:^|[-:])medium\b/i.test(model)) return true
  if (/(?:^|[-:])(?:small|tiny|mini)\b/i.test(model)) return true

  // Try to read a parameter count from the tag — e.g. "llama3.1:8b" → 8,
  // "qwen2.5:72b" → 72. We accept either ":<n>b" or "-<n>b".
  const sizeMatch = model.match(/[-:](\d+(?:\.\d+)?)b\b/i)
  if (sizeMatch) {
    const sizeB = parseFloat(sizeMatch[1])
    return sizeB < LARGE_PARAM_THRESHOLD_B
  }

  // No explicit size + no exclusion word → assume the bare tag means the
  // default (small) variant, which is what `ollama pull <name>` gives you.
  return true
}

function shouldShow(provider: string, model: string): boolean {
  if (provider !== 'ollama') return false
  return isLikelySmallOllamaModel(model)
}

export function ToolReliabilityHint() {
  // Settings live in localStorage and only change when the user clicks Apply
  // on the provider chip — but the chip lives in the same page, so we rehydrate
  // on the storage event AND on a manual focus event so the hint stays in sync.
  const [s, setS] = useState(loadSettings())
  useEffect(() => {
    const refresh = () => setS(loadSettings())
    window.addEventListener('storage', refresh)
    window.addEventListener('focus', refresh)
    // Also poll lightly — the chip's saveSettings call doesn't fire a storage
    // event for the SAME tab, so we cover that with a 2s tick.
    const id = window.setInterval(refresh, 2000)
    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener('focus', refresh)
      window.clearInterval(id)
    }
  }, [])

  if (!shouldShow(s.provider, s.model)) return null

  return (
    <div
      data-testid="workshop-tool-reliability-hint"
      className="mb-2 text-[11px] text-warn bg-warn/10 border border-warn/30 rounded px-2 py-1.5"
    >
      <strong className="font-semibold">Heads up:</strong> on small local models
      (like <span className="font-mono">{s.model || 'llama3.1'}</span>), tool
      calls sometimes appear as raw JSON in the reply instead of executing.
      That means the model picked the right tool but didn't run it. For
      cleaner runs, switch to a larger model or an OpenAI / Anthropic /
      Google key in the provider chip.
    </div>
  )
}

// Exported for unit tests.
export const __test = { isLikelySmallOllamaModel, shouldShow }
