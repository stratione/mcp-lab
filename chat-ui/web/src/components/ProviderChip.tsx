// chat-ui/web/src/components/ProviderChip.tsx
import { useEffect, useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { setProvider, getModels, testProviderKey, type ModelCatalog, type ProviderKeyTestResult } from '@/lib/api'
import { loadSettings, saveSettings } from '@/lib/settings'
import { useLab } from '@/lib/store'
import { useQuery } from '@tanstack/react-query'
import { ModelManager } from './ModelManager'

const PROVIDERS = [
  { v: 'ollama', label: 'Ollama (Local)' },
  { v: 'openai', label: 'OpenAI' },
  { v: 'anthropic', label: 'Anthropic' },
  { v: 'google', label: 'Google Gemini' },
]

// Maps provider id → the env var name the chat-ui's backend (chat-ui/app/main.py)
// reads at boot to populate _API_KEYS. Keep this in sync with that file when
// adding providers — it powers the "set X in .env.secrets" hint shown under
// the API key field.
const ENV_VAR_FOR_PROVIDER: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_API_KEY',
}

const AUTO_VALUE = 'auto'

export function ProviderChip() {
  const [s, setS] = useState(loadSettings())
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  // Provider-key test result lives only while the popover is open — clearing
  // it on provider/key changes prevents stale ✅ tags after the user switches
  // to a different provider whose key is invalid.
  const [keyTest, setKeyTest] = useState<ProviderKeyTestResult | null>(null)
  const [testing, setTesting] = useState(false)
  const tokens = useLab((x) => x.sessionTokens)

  // Reset the test result whenever the user changes provider or key.
  useEffect(() => {
    setKeyTest(null)
  }, [s.provider, s.apiKey, s.baseUrl])

  async function runKeyTest() {
    setTesting(true)
    try {
      const r = await testProviderKey({
        provider: s.provider,
        api_key: s.apiKey || undefined,
        base_url: s.baseUrl || undefined,
      })
      setKeyTest(r)
    } catch (e) {
      setKeyTest({
        ok: false,
        status: 0,
        message: e instanceof Error ? e.message : 'request failed',
        latency_ms: 0,
      })
    } finally {
      setTesting(false)
    }
  }

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
      // Close the popover and drop the user straight into the chat input
      // so they can start typing without an extra click.
      setOpen(false)
      requestAnimationFrame(() => {
        const input = document.querySelector<HTMLTextAreaElement>('[data-testid="chat-input"]')
        input?.focus()
      })
    } finally {
      setBusy(false)
    }
  }

  const displayedModel =
    s.model === AUTO_VALUE && catalog
      ? `auto → ${catalog.auto_resolves_to}`
      : s.model || '—'

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
            {/* Recommended picks float to the top of the list so attendees
                can grab a workshop-validated model without scanning. */}
            {[...(catalog?.models ?? [])]
              .sort((a, b) => Number(!!b.recommended) - Number(!!a.recommended))
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.recommended ? '★ ' : ''}
                  {m.installed === false ? '○ ' : m.installed === true ? '● ' : ''}
                  {m.label}
                  {m.installed === false ? '  (not pulled)' : ''}
                </option>
              ))}
          </select>
          {s.provider === 'ollama' ? (
            <div className="flex items-center justify-between mt-1">
              <p className="text-[10px] text-faint">
                ★ recommended · ● installed · ○ in catalog
              </p>
              <ModelManager />
            </div>
          ) : (
            <p className="text-[10px] text-faint mt-1">
              ★ workshop-validated for tool calling — others may work but
              haven’t been spot-checked.
            </p>
          )}
        </div>
        <div>
          <Label>API key</Label>
          <Input
            type="password"
            value={s.apiKey}
            onChange={(e) => setS({ ...s, apiKey: e.target.value })}
            placeholder={s.provider === 'ollama' ? 'not required' : 'sk-…'}
            disabled={s.provider === 'ollama'}
          />
          {s.provider !== 'ollama' && (
            <p
              className="mt-1 text-[10px] text-faint leading-snug"
              data-testid="env-secrets-hint"
            >
              💡 Or set{' '}
              <code className="font-mono text-muted">
                {ENV_VAR_FOR_PROVIDER[s.provider] ?? 'PROVIDER_API_KEY'}
              </code>{' '}
              in <code className="font-mono text-muted">.env.secrets</code> at the project
              root — the lab loads it on every restart so you don't have to paste it each session.
            </p>
          )}
          <div className="flex items-center gap-2 mt-1.5">
            <button
              type="button"
              onClick={runKeyTest}
              disabled={testing}
              className="text-[10px] px-2 py-0.5 rounded border border-border bg-bg text-muted hover:text-text disabled:opacity-50"
              data-testid="test-key-btn"
              title={
                s.provider === 'ollama'
                  ? 'Pings Ollama at the configured URL — no token cost'
                  : 'Calls /v1/models on the provider — auth check, no token cost'
              }
            >
              {testing ? 'Testing…' : 'Test connection'}
            </button>
            {keyTest && (
              <span
                className={`text-[10px] font-mono ${keyTest.ok ? 'text-ok' : 'text-err'}`}
                data-testid="test-key-result"
                title={keyTest.message}
              >
                {keyTest.ok ? '✅' : '❌'} {keyTest.message}
                {keyTest.latency_ms > 0 && (
                  <span className="text-faint"> ({keyTest.latency_ms}ms)</span>
                )}
              </span>
            )}
          </div>
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
