// chat-ui/web/src/components/ProviderChip.tsx
import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { setProvider } from '@/lib/api'
import { loadSettings, saveSettings } from '@/lib/settings'
import { useLab } from '@/lib/store'

const PROVIDERS = [
  { v: 'ollama', label: 'Ollama (Local)' },
  { v: 'openai', label: 'OpenAI' },
  { v: 'anthropic', label: 'Anthropic' },
  { v: 'google', label: 'Google Gemini' },
  { v: 'pretend', label: 'Demo LLM' },
]

export function ProviderChip() {
  const [s, setS] = useState(loadSettings())
  const [busy, setBusy] = useState(false)
  const tokens = useLab((x) => x.sessionTokens)

  async function apply() {
    setBusy(true)
    try {
      await setProvider({ provider: s.provider, api_key: s.apiKey || undefined, model: s.model || undefined, base_url: s.baseUrl })
      saveSettings(s)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-xs text-muted px-2 py-1 rounded-md border border-border bg-bg whitespace-nowrap hover:text-text"
        >
          ⬩ {s.provider} · {s.model || '—'} · {tokens.toLocaleString()} tok ▾
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[320px] p-3 space-y-3">
        <div>
          <Label>Provider</Label>
          <select
            className="w-full bg-bg border border-border rounded-md text-sm px-2 py-1.5"
            value={s.provider}
            onChange={(e) => setS({ ...s, provider: e.target.value })}
          >
            {PROVIDERS.map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <Label>Model</Label>
          <Input value={s.model} onChange={(e) => setS({ ...s, model: e.target.value })} placeholder="llama3.1" />
        </div>
        <div>
          <Label>API key</Label>
          <Input type="password" value={s.apiKey} onChange={(e) => setS({ ...s, apiKey: e.target.value })} placeholder="sk-…" />
        </div>
        <div className="flex justify-between items-center text-xs text-muted">
          <span>Session tokens: <span className="text-text">{tokens.toLocaleString()}</span></span>
          <Button size="sm" onClick={apply} disabled={busy}>
            {busy ? 'Applying…' : 'Apply'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase tracking-wider text-faint mb-1">{children}</div>
}
