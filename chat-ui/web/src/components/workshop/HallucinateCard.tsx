import { useEffect } from 'react'
import { useLab } from '@/lib/store'

type Pass = 'cold-open' | 'pre-enable' | 'post-enable' | 'exercise'

type Props = {
  mcpLabel: string
  prompt: string
  pass: Pass
  heading?: string
  tool?: string
  teach?: string
}

const HEADINGS: Record<Pass, string> = {
  'cold-open': 'Step 1 — Ask before you have any tools',
  'pre-enable': 'Without the MCP — what does the model say?',
  'post-enable': 'With the MCP on — does the answer change?',
  // Exercise is the SDLC-walkthrough mode: each card just demonstrates one
  // tool. No hallucinate-vs-grounded contrast — that already happened in
  // the cold-open. The custom `heading` prop overrides this default.
  'exercise': 'Try it — exercise this tool',
}

export function HallucinateCard({ mcpLabel, prompt, pass, heading, tool, teach }: Props) {
  const setPending = useLab((s) => s.setPendingPrompt)

  // Pre-fill the chat input on mount. Never auto-send.
  useEffect(() => {
    setPending(prompt)
  }, [prompt, setPending])

  const title = heading ?? HEADINGS[pass]

  return (
    <div data-testid="workshop-hallucinate" className="space-y-3">
      <h3 className="font-semibold">{title}</h3>
      {mcpLabel && <div className="text-xs text-muted">{mcpLabel}</div>}
      <p className="text-muted">
        The prompt is in the chat box. Click Send when you're ready, then use the
        <span className="whitespace-nowrap"> forward → </span> button below to continue.
      </p>
      <div className="font-mono text-xs bg-bg border border-border rounded p-2">{prompt}</div>
      {tool && (
        <div className="text-[11px] text-faint">
          → expected tool: <span className="font-mono">{tool}</span>
        </div>
      )}
      {teach && <p className="text-xs text-muted italic">{teach}</p>}
    </div>
  )
}
