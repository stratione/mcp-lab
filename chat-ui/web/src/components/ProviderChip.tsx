// chat-ui/web/src/components/ProviderChip.tsx
import { useEffect, useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { setProvider, getModels, type ModelCatalog } from '@/lib/api'
import { loadSettings, saveSettings } from '@/lib/settings'
import { useLab } from '@/lib/store'
import { useQuery } from '@tanstack/react-query'
import { ModelManager } from './ModelManager'

const PROVIDERS = [
  { v: 'ollama', label: 'Ollama (Local)' },
  { v: 'openai', label: 'OpenAI' },
  { v: 'anthropic', label: 'Anthropic' },
  { v: 'google', label: 'Google Gemini' },
  { v: 'pretend', label: 'Demo LLM' },
]

const AUTO_VALUE = 'auto'

export function ProviderChip() {
  const [s, setS] = useState(loadSettings())
  const [busy, setBusy] = useState(false)
  const tokens = useLab((x) => x.sessionTokens)

  const { data: catalog, isLoading: catalogLoading, refetch: refetchCatalog } = useQuery<ModelCatalog>({
    queryKey: ['models', s.provider, s.apiKey],
    queryFn: ({ signal }) => getModels(s.provider, signal),
    staleTime: 30_000,
  })

  // If the saved model isn't in the catalog any more (e.g. switched provider),
  // gently fall back to "auto" so the dropdown always has a valid selection.
  useEffect(() => {
    if (!catalog) return
    const ids = new Set(catalog.models.map((m) => m.id))
    if (s.model && s.model !== AUTO_VALUE && !ids.has(s.model)) {
      setS((cur) => ({ ...cur, model: AUTO_VALUE }))
    }
  }, [catalog, s.model])

  async function apply() {
    setBusy(true)
    try {
      await setProvider({
        provider: s.provider,
        api_key: s.apiKey || undefined,
        model: s.model || AUTO_VALUE,
        base_url: s.baseUrl,
      })
      saveSettings(s)
      refetchCatalog()
    } finally {
      setBusy(false)
    }
  }

  const displayedModel =
    s.model === AUTO_VALUE && catalog
      ? `auto → ${catalog.auto_resolves_to}`
      : s.model || '—'

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-xs text-muted px-2 py-1 rounded-md border border-border bg-bg whitespace-nowrap hover:text-text"
          data-testid="provider-chip"
        >
          ⬩ {s.provider} · {displayedModel} · {tokens.toLocaleString()} tok ▾
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[340px] p-3 space-y-3">
        <div>
          <Label>Provider</Label>
          <select
            className="w-full bg-bg border border-border rounded-md text-sm px-2 py-1.5"
            value={s.provider}
            onChange={(e) => setS({ ...s, provider: e.target.value, model: AUTO_VALUE })}
          >
            {PROVIDERS.map((p) => (
              <option key={p.v} value={p.v}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Model</Label>
          <select
            className="w-full bg-bg border border-border rounded-md text-sm px-2 py-1.5"
            value={s.model || AUTO_VALUE}
            onChange={(e) => setS({ ...s, model: e.target.value })}
            disabled={catalogLoading}
            data-testid="model-select"
          >
            <option value={AUTO_VALUE}>
              ✨ Auto (recommended) — {catalog?.auto_resolves_to ?? '…'}
            </option>
            {catalog?.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.installed === false ? '○ ' : m.installed === true ? '● ' : ''}
                {m.label}
                {m.installed === false ? '  (not pulled)' : ''}
              </option>
            ))}
          </select>
          {s.provider === 'ollama' && (
            <div className="flex items-center justify-between mt-1">
              <p className="text-[10px] text-faint">
                ● installed · ○ in catalog
              </p>
              <ModelManager />
            </div>
          )}
        </div>
        <div>
          <Label>API key</Label>
          <Input
            type="password"
            value={s.apiKey}
            onChange={(e) => setS({ ...s, apiKey: e.target.value })}
            placeholder={s.provider === 'ollama' ? 'not required' : 'sk-…'}
            disabled={s.provider === 'ollama' || s.provider === 'pretend'}
          />
        </div>
        <div className="flex justify-between items-center text-xs text-muted">
          <span>
            Session tokens: <span className="text-text">{tokens.toLocaleString()}</span>
          </span>
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
