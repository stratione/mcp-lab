import { useState } from 'react'
import { sendChatCompare } from '@/lib/api'

type Pane = { provider: string; model: string; halu: boolean; reply: string; busy: boolean; error?: string }
const init = (provider: string, model: string): Pane => ({ provider, model, halu: false, reply: '', busy: false })

export function CompareTab() {
  const [prompt, setPrompt] = useState('')
  const [left, setLeft] = useState<Pane>(init('ollama', 'llama3.1'))
  const [right, setRight] = useState<Pane>(init('anthropic', 'claude-sonnet-4-5-20250929'))

  async function run() {
    if (!prompt.trim()) return
    setLeft({ ...left, busy: true, reply: '', error: undefined })
    setRight({ ...right, busy: true, reply: '', error: undefined })
    try {
      const res = await sendChatCompare({
        prompt,
        left: { provider: left.provider, model: left.model, hallucination_mode: left.halu },
        right: { provider: right.provider, model: right.model, hallucination_mode: right.halu },
      }) as { left?: { reply?: string }; right?: { reply?: string } }
      setLeft({ ...left, busy: false, reply: res?.left?.reply ?? '' })
      setRight({ ...right, busy: false, reply: res?.right?.reply ?? '' })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'failed'
      setLeft({ ...left, busy: false, error: msg })
      setRight({ ...right, busy: false, error: msg })
    }
  }

  return (
    <div className="p-3 text-sm">
      <div className="grid grid-cols-2 gap-2 mb-2">
        <PaneConfig label="Left" pane={left} onChange={setLeft} />
        <PaneConfig label="Right" pane={right} onChange={setRight} />
      </div>
      <textarea
        rows={2}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        className="w-full bg-bg border border-border rounded-md p-2 text-sm mb-2"
        placeholder="Ask both providers the same thing…"
      />
      <button onClick={run} className="bg-primary text-primary-fg rounded-md px-3 py-1.5 text-sm">Run both</button>
      <div className="grid grid-cols-1 gap-2 mt-3">
        <PaneOut label={`${left.provider} · ${left.model}`} pane={left} />
        <PaneOut label={`${right.provider} · ${right.model}`} pane={right} />
      </div>
    </div>
  )
}

function PaneConfig({ label, pane, onChange }: { label: string; pane: Pane; onChange: (p: Pane) => void }) {
  return (
    <div className="bg-surface-2 border border-border rounded-md p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted mb-1">{label}</div>
      <select value={pane.provider} onChange={(e) => onChange({ ...pane, provider: e.target.value })} className="w-full bg-bg border border-border rounded text-xs px-1 py-0.5 mb-1">
        {['ollama', 'openai', 'anthropic', 'google', 'pretend'].map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      <input value={pane.model} onChange={(e) => onChange({ ...pane, model: e.target.value })} className="w-full bg-bg border border-border rounded text-xs px-1 py-0.5 mb-1" />
      <label className="flex items-center gap-1 text-[10px] text-muted">
        <input type="checkbox" checked={pane.halu} onChange={(e) => onChange({ ...pane, halu: e.target.checked })} />
        Flying blind
      </label>
    </div>
  )
}

function PaneOut({ label, pane }: { label: string; pane: Pane }) {
  return (
    <div className="bg-surface-2 border border-border rounded-md p-2 min-h-[80px]">
      <div className="text-[11px] font-semibold mb-1">{label}</div>
      {pane.busy ? <span className="text-muted italic">running…</span> : pane.error ? <span className="text-err">{pane.error}</span> : <pre className="whitespace-pre-wrap text-[12px]">{pane.reply}</pre>}
    </div>
  )
}
