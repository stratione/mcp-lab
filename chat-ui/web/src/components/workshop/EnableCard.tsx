import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useServers } from '@/features/servers/useServers'
import { useQuery } from '@tanstack/react-query'
import { getMcpStatusEnvelope } from '@/lib/api'

export function EnableCard({ mcp, onNext }: { mcp: string; onNext: () => void }) {
  const { data: servers } = useServers()
  // Engine label comes from the mcp-status envelope, not the server array.
  const { data: env } = useQuery({
    queryKey: ['mcp-status-envelope'],
    queryFn: ({ signal }) => getMcpStatusEnvelope(signal),
    refetchInterval: 30_000,
  })
  const [copied, setCopied] = useState(false)
  const engine = env?.engine ?? 'docker'
  const cmd = `${engine} compose up -d ${mcp}`
  // Backend's check_servers() strips the 'mcp-' prefix from server names
  // (chat-ui/app/mcp_client.py: host.replace("mcp-", "")). Strip it here for
  // the lookup, but keep the full name in `cmd` so the CLI command matches
  // the docker-compose service name the user actually types.
  const shortName = mcp.replace(/^mcp-/, '')
  const online = servers?.find((s) => s.name === shortName)?.status === 'online'

  async function copy() {
    await navigator.clipboard.writeText(cmd)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div data-testid="workshop-enable" className="space-y-3">
      <h3 className="font-semibold">Step 2 — Enable {mcp}</h3>
      <p className="text-muted">Run this in your terminal:</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 font-mono text-xs bg-bg border border-border rounded p-2">
          $ {cmd}
        </code>
        <Button size="sm" variant="outline" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <div className="text-xs" data-testid="workshop-enable-status">
        {online ? (
          <span className="text-ok">✓ {mcp} is online.</span>
        ) : (
          <span className="text-muted">Waiting for {mcp} to come online…</span>
        )}
      </div>
      <div className="flex justify-end">
        <Button size="sm" disabled={!online} onClick={onNext}>Next →</Button>
      </div>
    </div>
  )
}
