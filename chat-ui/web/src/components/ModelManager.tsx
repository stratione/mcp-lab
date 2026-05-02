// chat-ui/web/src/components/ModelManager.tsx
//
// In-GUI Ollama model manager. Lets workshop participants list installed
// models, pull new ones with a live progress bar, and delete to recover
// disk. Uses the SSE endpoint POST /api/ollama/pull which streams Ollama's
// /api/pull JSONL as Server-Sent Events.
//
// Workshop caveat: pulling a 9.6 GB model on conference wifi will not be
// fun. The banner at the top of the dialog says exactly that.

import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { getOllamaInstalled, deleteOllamaModel, getModels, type ModelEntry } from '@/lib/api'

const HUMAN_BYTES = (n?: number) => {
  if (!n || n < 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`
}

type PullProgress = {
  status: string
  digest?: string
  total?: number
  completed?: number
  done: boolean
  error?: string
}

export function ModelManager() {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="text-xs text-muted hover:text-text underline underline-offset-2"
          data-testid="open-model-manager"
        >
          Manage models…
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Ollama Model Manager</DialogTitle>
        </DialogHeader>
        <div className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
          ⚠ Pulling a model needs internet. On conference wifi this may be slow or fail —
          best done at home before the workshop. See <code>docs/PRE-WORKSHOP.md</code>.
        </div>
        <ManagerBody />
      </DialogContent>
    </Dialog>
  )
}

function ManagerBody() {
  const qc = useQueryClient()
  const installed = useQuery({
    queryKey: ['ollama-installed'],
    queryFn: ({ signal }) => getOllamaInstalled(signal),
    refetchInterval: 5_000,
  })
  const catalog = useQuery({
    queryKey: ['models', 'ollama'],
    queryFn: ({ signal }) => getModels('ollama', signal),
  })

  const [selected, setSelected] = useState('')
  const [customName, setCustomName] = useState('')
  const [pull, setPull] = useState<PullProgress | null>(null)
  const sourceRef = useRef<EventSource | null>(null)
  const aborterRef = useRef<AbortController | null>(null)

  function startPull(name: string) {
    if (!name.trim()) return
    setPull({ status: 'starting', done: false })
    // EventSource doesn't support POST natively, so we use fetch + ReadableStream.
    aborterRef.current = new AbortController()
    fetch('/api/ollama/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
      signal: aborterRef.current.signal,
    })
      .then(async (res) => {
        if (!res.body) throw new Error('No stream body')
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const frames = buffer.split('\n\n')
          buffer = frames.pop() || ''
          for (const frame of frames) {
            const dataLine = frame.split('\n').find((l) => l.startsWith('data:'))
            const errLine = frame.split('\n').find((l) => l.startsWith('event: error'))
            if (errLine && dataLine) {
              try {
                const e = JSON.parse(dataLine.slice(5).trim())
                setPull({ status: 'error', done: true, error: e.detail || 'pull failed' })
              } catch {
                setPull({ status: 'error', done: true, error: dataLine })
              }
              return
            }
            if (!dataLine) continue
            try {
              const j = JSON.parse(dataLine.slice(5).trim())
              const isDone = j.status === 'success'
              setPull({
                status: j.status || 'pulling',
                digest: j.digest,
                total: j.total,
                completed: j.completed,
                done: isDone,
              })
              if (isDone) {
                qc.invalidateQueries({ queryKey: ['ollama-installed'] })
                qc.invalidateQueries({ queryKey: ['models', 'ollama'] })
              }
            } catch {
              /* ignore unparsable line */
            }
          }
        }
      })
      .catch((e: Error) => {
        if (e.name === 'AbortError') {
          setPull({ status: 'cancelled', done: true })
          return
        }
        setPull({ status: 'error', done: true, error: e.message })
      })
      .finally(() => {
        sourceRef.current = null
        aborterRef.current = null
      })
  }

  function cancelPull() {
    aborterRef.current?.abort()
  }

  useEffect(() => {
    return () => aborterRef.current?.abort()
  }, [])

  async function handleDelete(name: string) {
    if (!confirm(`Remove ${name} from local Ollama? You can re-pull it any time.`)) return
    try {
      await deleteOllamaModel(name)
      qc.invalidateQueries({ queryKey: ['ollama-installed'] })
      qc.invalidateQueries({ queryKey: ['models', 'ollama'] })
    } catch (e) {
      alert(`Delete failed: ${e instanceof Error ? e.message : 'unknown'}`)
    }
  }

  const installedNames = new Set(installed.data?.models.map((m) => m.name) ?? [])
  const pullable: ModelEntry[] = (catalog.data?.models ?? []).filter((m) => !installedNames.has(m.id))

  return (
    <div className="space-y-4">
      <section>
        <h4 className="text-xs uppercase tracking-wider text-faint mb-2">Installed</h4>
        {installed.isLoading && <div className="text-xs text-muted">Loading…</div>}
        {installed.isError && <div className="text-xs text-err">Could not reach Ollama daemon.</div>}
        {!installed.isLoading && !installed.isError && (installed.data?.models.length ?? 0) === 0 && (
          <div className="text-xs text-muted">Nothing pulled yet. Use the form below.</div>
        )}
        <ul className="divide-y divide-border">
          {installed.data?.models.map((m) => (
            <li key={m.name} className="py-2 flex items-center justify-between text-sm">
              <div className="flex flex-col">
                <span className="font-mono">{m.name}</span>
                <span className="text-[11px] text-muted">{HUMAN_BYTES(m.size)}</span>
              </div>
              <Button size="sm" variant="outline" onClick={() => handleDelete(m.name)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h4 className="text-xs uppercase tracking-wider text-faint mb-2">Pull a new model</h4>
        <div className="flex gap-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={!!pull && !pull.done}
            className="flex-1 bg-bg border border-border rounded-md text-sm px-2 py-1.5"
          >
            <option value="">— pick from the catalog —</option>
            {pullable.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} ({m.id})
              </option>
            ))}
          </select>
          <Button
            size="sm"
            disabled={!selected || (!!pull && !pull.done)}
            onClick={() => selected && startPull(selected)}
          >
            Pull
          </Button>
        </div>
        <div className="flex gap-2 mt-2 items-center">
          <span className="text-[11px] text-faint">or paste a tag:</span>
          <Input
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="e.g. qwen3:7b"
            disabled={!!pull && !pull.done}
            className="flex-1"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={!customName.trim() || (!!pull && !pull.done)}
            onClick={() => startPull(customName.trim())}
          >
            Pull custom
          </Button>
        </div>
      </section>

      {pull && (
        <section className="rounded-md border border-border bg-surface-2 p-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-mono">{pull.status}{pull.digest ? ` · ${pull.digest.slice(0, 14)}…` : ''}</span>
            {!pull.done && (
              <Button size="sm" variant="outline" onClick={cancelPull}>
                Cancel
              </Button>
            )}
          </div>
          {pull.total ? (
            <div>
              <div className="h-2 bg-bg border border-border rounded overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${Math.min(100, ((pull.completed ?? 0) / pull.total) * 100)}%` }}
                />
              </div>
              <div className="text-[11px] text-muted mt-1">
                {HUMAN_BYTES(pull.completed)} / {HUMAN_BYTES(pull.total)}
              </div>
            </div>
          ) : null}
          {pull.error && <div className="text-xs text-err">{pull.error}</div>}
          {pull.done && pull.status === 'success' && (
            <div className="text-xs text-ok">✓ Pulled. The model is now selectable in the model picker.</div>
          )}
        </section>
      )}
    </div>
  )
}
