import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { useLab } from '@/lib/store'

type Props = {
  mcpLabel: string
  prompt: string
  onNext: () => void
  pass: 'cold-open' | 'pre-enable' | 'post-enable'
}

const HEADINGS: Record<Props['pass'], string> = {
  'cold-open': 'Step 1 — Ask before you have any tools',
  'pre-enable': 'Without the MCP — what does the model say?',
  'post-enable': 'With the MCP on — does the answer change?',
}

export function HallucinateCard({ mcpLabel, prompt, onNext, pass }: Props) {
  const setPending = useLab((s) => s.setPendingPrompt)

  // Pre-fill the chat input on mount. Never auto-send.
  useEffect(() => {
    setPending(prompt)
  }, [prompt, setPending])

  return (
    <div data-testid="workshop-hallucinate" className="space-y-3">
      <h3 className="font-semibold">{HEADINGS[pass]}</h3>
      <div className="text-xs text-muted">{mcpLabel}</div>
      <p className="text-muted">The prompt is in the chat box. Click Send when you're ready.</p>
      <div className="font-mono text-xs bg-bg border border-border rounded p-2">{prompt}</div>
      <div className="flex justify-end">
        <Button size="sm" onClick={onNext}>Next →</Button>
      </div>
    </div>
  )
}
