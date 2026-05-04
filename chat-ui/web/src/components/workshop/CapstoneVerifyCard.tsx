import { useEffect, useState } from 'react'
import { probeUrl } from '@/lib/api'
import type { ProbeResult } from '@/lib/schemas'

// Capstone payoff: after the LLM was asked to build → scan → promote → deploy
// the hello-app, this card hits the dev port (9080) where deploy_app maps the
// running container. If the deploy actually happened, we render the real
// {message: "Hello from MCP Lab!", version: "1.0.0"} response — visible proof
// that the MCP chain produced a real side-effect, not just talk.
//
// If the probe fails, we tell the user what that means rather than hiding it:
// the runner either wasn't called (model didn't execute the tool) or the
// build/deploy errored out. Either way, the result is informative.

const DEV_PORT_URL = 'http://localhost:9080/'
const POLL_INTERVAL_MS = 4000
const MAX_POLLS = 30  // ~2 minutes — plenty for a clean build/deploy cycle

export function CapstoneVerifyCard() {
  const [result, setResult] = useState<ProbeResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [polls, setPolls] = useState(0)
  const [stopped, setStopped] = useState(false)

  // Poll the dev port until the app responds or we hit the cap. Builds take
  // 30–60s on first run, so a single up-front probe wouldn't catch the
  // success window — we tick lightly until the container answers.
  useEffect(() => {
    if (stopped) return
    if (result?.status === 200) return
    if (polls >= MAX_POLLS) return

    let cancelled = false
    const id = window.setTimeout(() => {
      probeUrl(DEV_PORT_URL)
        .then((r) => {
          if (cancelled) return
          setResult(r)
          setError(null)
          setPolls((n) => n + 1)
        })
        .catch((e: Error) => {
          if (cancelled) return
          setError(e.message)
          setPolls((n) => n + 1)
        })
    }, polls === 0 ? 0 : POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearTimeout(id)
    }
  }, [polls, result, stopped])

  const ok = result?.status === 200
  const exhausted = polls >= MAX_POLLS && !ok

  return (
    <div data-testid="workshop-capstone-verify" className="space-y-3">
      <h3 className="font-semibold">Did it actually run?</h3>
      <p className="text-muted">
        If the model called <span className="font-mono">deploy_app</span>, the
        runner built the image, pushed it to the dev registry, pulled it back,
        and started the container on port 9080. We're checking that port now.
      </p>
      <div className="font-mono text-xs bg-bg border border-border rounded p-2">
        $ curl {DEV_PORT_URL}
      </div>
      <pre
        data-testid="workshop-capstone-body"
        className="font-mono text-[11px] bg-bg border border-border rounded p-2 max-h-40 overflow-auto whitespace-pre-wrap"
      >
        {ok
          ? JSON.stringify(result?.body, null, 2)
          : error
          ? `error: ${error}`
          : `probing ${DEV_PORT_URL} (attempt ${polls})…`}
      </pre>

      {ok && (
        <p className="text-xs text-ok">
          ✓ The deployed container is responding. Open{' '}
          <a
            href={DEV_PORT_URL}
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-text"
          >
            {DEV_PORT_URL}
          </a>{' '}
          in a new tab to see it live.
        </p>
      )}

      {!ok && exhausted && (
        <div className="text-xs text-warn space-y-1">
          <p>
            Nothing answering on port 9080 after {MAX_POLLS} tries. Two
            common reasons:
          </p>
          <ul className="pl-4 list-disc space-y-0.5">
            <li>The model didn't actually execute <span className="font-mono">deploy_app</span> — it may have just printed JSON. Switch to a larger model and retry the capstone.</li>
            <li>The build / push / deploy errored out. Check the Trace tab for tool-call results.</li>
          </ul>
          <button
            type="button"
            className="mt-1 px-2 py-0.5 rounded border border-border bg-bg text-muted hover:text-text"
            onClick={() => {
              setStopped(false)
              setPolls(0)
              setResult(null)
              setError(null)
            }}
          >
            Retry probe
          </button>
        </div>
      )}

      {!ok && !exhausted && !error && (
        <p className="text-xs text-faint italic">
          Builds take 30–60s the first time. Hang tight…
          {!stopped && (
            <button
              type="button"
              className="ml-2 underline hover:text-text"
              onClick={() => setStopped(true)}
            >
              stop polling
            </button>
          )}
        </p>
      )}
    </div>
  )
}
