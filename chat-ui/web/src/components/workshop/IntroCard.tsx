export function IntroCard() {
  return (
    <div data-testid="workshop-intro" className="space-y-3">
      <h3 className="font-semibold">Welcome to the MCP Lab</h3>
      <p className="text-muted">
        We're going to ask the model questions about a real lab — but with
        nothing turned on yet. You'll see it guess.
      </p>
      <p className="text-muted">
        Then you'll turn on one tool category at a time and watch the answers
        switch from made-up to grounded in real data.
      </p>
      <p className="text-[11px] text-faint">
        Take your time. Use <span className="whitespace-nowrap">forward →</span> below to step through.
      </p>
    </div>
  )
}
