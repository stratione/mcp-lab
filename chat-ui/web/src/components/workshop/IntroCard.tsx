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
  const conductorCmd = './scripts/7-workshop.sh'
  const allUpCmd = `${engine} compose up -d ${MCP_LIST}`
  const [copied, setCopied] = useState<'conductor' | 'all' | null>(null)

  async function copy(label: 'conductor' | 'all', text: string) {
    await navigator.clipboard.writeText(text)
    setCopied(label)
    setTimeout(() => setCopied(null), 1500)
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
          Runner commands · bring the lab up
        </summary>
        <div className="space-y-2 mt-2 pl-1">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-faint mb-1">
              Conductor (recommended)
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 font-mono text-xs bg-bg border border-border rounded p-2">
                $ {conductorCmd}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => copy('conductor', conductorCmd)}
                data-testid="workshop-intro-copy-conductor"
              >
                {copied === 'conductor' ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <p className="text-[11px] text-faint mt-1">
              Preflight checks, stops every MCP, opens this wizard.
            </p>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-faint mb-1">
              Skip the per-step pacing — start every MCP now
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 font-mono text-xs bg-bg border border-border rounded p-2 break-all">
                $ {allUpCmd}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => copy('all', allUpCmd)}
                data-testid="workshop-intro-copy-all"
              >
                {copied === 'all' ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <p className="text-[11px] text-faint mt-1">
              Use this if you want to explore freely instead of stepping through.
            </p>
          </div>
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
