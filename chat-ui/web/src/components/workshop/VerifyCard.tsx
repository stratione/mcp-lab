import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useLab } from '@/lib/store'
import { probeUrl } from '@/lib/api'
import type { ProbeResult } from '@/lib/schemas'

type Props = {
  mcp: string
  prompt: string
  probe: { url: string; auth?: 'basic' }
  teach: string
  onNext: () => void
}

export function VerifyCard({ prompt, probe, teach, onNext }: Props) {
  const setPending = useLab((s) => s.setPendingPrompt)
  const [result, setResult] = useState<ProbeResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setPending(prompt)
    let cancelled = false
    probeUrl(probe.url)
      .then((r) => { if (!cancelled) setResult(r) })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [prompt, probe.url, setPending])

  const done = result !== null || error !== null

  return (
    <div data-testid="workshop-verify" className="space-y-3">
      <h3 className="font-semibold">Step 3 — Verify against the real endpoint</h3>
      <p className="text-muted">Re-send the prompt (still in the chat box). Compare to the live API:</p>
      <div className="font-mono text-xs bg-bg border border-border rounded p-2">
        $ curl {probe.auth === 'basic' ? '-u mcpadmin:mcpadmin123 ' : ''}{probe.url}
      </div>
      <pre
        data-testid="workshop-verify-body"
        className="font-mono text-[11px] bg-bg border border-border rounded p-2 max-h-32 overflow-auto whitespace-pre-wrap"
      >
        {error
          ? `error: ${error}`
          : result
          ? JSON.stringify(result.body, null, 2).slice(0, 800)
          : 'probing…'}
      </pre>
      <p className="text-xs text-muted italic">{teach}</p>
      <div className="flex justify-end">
        <Button size="sm" disabled={!done} onClick={onNext}>Next →</Button>
      </div>
    </div>
  )
}
