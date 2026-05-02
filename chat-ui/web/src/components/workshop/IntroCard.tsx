import { Button } from '@/components/ui/button'

export function IntroCard({ onNext }: { onNext: () => void }) {
  return (
    <div data-testid="workshop-intro" className="space-y-3">
      <h3 className="font-semibold">Welcome to the MCP Lab</h3>
      <p className="text-muted">
        All five MCP servers are stopped. We're going to ask the LLM questions
        about a real lab of services it can't currently reach. Then we'll bring
        each MCP up — one at a time — and watch the answers go from
        plausible-but-fake to grounded in the actual API.
      </p>
      <p className="text-muted">
        Every step takes one explicit click. Take your time.
      </p>
      <div className="flex justify-end">
        <Button size="sm" onClick={onNext}>Begin</Button>
      </div>
    </div>
  )
}
