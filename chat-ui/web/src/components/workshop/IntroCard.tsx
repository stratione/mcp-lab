import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useQuery } from '@tanstack/react-query'
import { getMcpStatusEnvelope } from '@/lib/api'

const MCP_LIST = 'mcp-user mcp-gitea mcp-registry mcp-promotion'

export function IntroCard({ onNext }: { onNext: () => void }) {
  const { data: env } = useQuery({
    queryKey: ['mcp-status-envelope'],
    queryFn: ({ signal }) => getMcpStatusEnvelope(signal),
    refetchInterval: 30_000,
  })
  const engine = env?.engine ?? 'docker'
  const allUpCmd = `${engine} compose up -d ${MCP_LIST}`
  const [copied, setCopied] = useState(false)

  async function copy(text: string) {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div data-testid="workshop-intro" className="space-y-3">
      <h3 className="font-semibold">Welcome to the MCP Lab</h3>
      <p className="text-muted">
        All five MCP servers are stopped. We're going to ask the LLM questions
        about a real lab of services it can't currently reach. Then we'll bring
        each MCP up — one at a time — and watch the answers go from
        plausible-but-fake to grounded in the actual API.
      </p>
      <details className="text-xs text-muted">
        <summary className="cursor-pointer hover:text-text">
          Skip the per-step pacing — start every MCP now
        </summary>
        <div className="space-y-2 mt-2 pl-1">
          <div className="flex items-center gap-2">
            <code className="flex-1 font-mono text-xs bg-bg border border-border rounded p-2 break-all">
              $ {allUpCmd}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => copy(allUpCmd)}
              data-testid="workshop-intro-copy-all"
            >
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <p className="text-[11px] text-faint mt-1">
            Use this if you want to explore freely instead of stepping through.
          </p>
        </div>
      </details>
      <p className="text-muted">
        Every step takes one explicit click. Take your time.
      </p>
      <div className="flex justify-end">
        <Button size="sm" onClick={onNext}>Begin</Button>
      </div>
    </div>
  )
}
