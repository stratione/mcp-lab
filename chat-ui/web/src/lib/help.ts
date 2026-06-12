// Teaching copy for the lab's rich tooltips — one place to keep every
// hover-to-learn explanation, so the UI is self-documenting. Bodies are kept to
// a sentence or two: enough to orient a learner without opening a modal.
import type { StageId, StageStatus } from './pipeline'
import type { InspectorTab } from './store'

// Pipeline stage nodes (the spine of the Pipeline Board).
export const STAGE_HELP: Record<StageId, string> = {
  commit:
    'The latest commit pushed to the sample-app repo in Gitea. Everything downstream is built from exactly this commit.',
  ci: 'The CI pipeline (Gitea Actions). On every push it runs the tests, builds the container image, and pushes it to the dev registry.',
  'registry-dev':
    'The development image registry. Freshly built images land here first — before any security gate.',
  scan: 'The Trivy security gate. An image must pass a vulnerability scan (0 criticals) before it can be promoted onward.',
  staging:
    'The staging registry. Images promoted out of dev land here — and must be re-scanned in staging before they can reach prod.',
  prod: 'The production registry. The only road in is through both scan gates; whatever is here is what gets deployed.',
  deployed:
    "The running container, pulled from an environment's registry. Its /health endpoint is polled live.",
}

// Event-feed source badges.
export const SOURCE_HELP: Record<string, string> = {
  gitea: 'A git event from Gitea — usually a push to the sample-app repo.',
  runner: 'The CI runner (Gitea Actions) — a build/test pipeline event.',
  scan: 'A Trivy vulnerability scan was recorded against an image.',
  promotion: 'An image moved between registries (dev → staging → prod), or was rolled back.',
  deploy: "A container was (re)deployed from an environment's registry.",
  manual: 'An action taken by hand via labctl or the API, outside the automated flow.',
}

// Stage-status color legend.
export const STATUS_LEGEND: { status: StageStatus; label: string; dot: string; body: string }[] = [
  { status: 'green', label: 'ok', dot: 'bg-emerald-400', body: 'Completed successfully — this stage is healthy.' },
  { status: 'blue', label: 'running', dot: 'bg-blue-400', body: 'Work is happening right now — a build, scan, or deploy in progress.' },
  { status: 'red', label: 'failed', dot: 'bg-red-400', body: 'This stage hit an error and stopped the flow downstream.' },
  { status: 'gray', label: 'idle', dot: 'bg-faint', body: 'Nothing here yet — this stage has not run, or its service is offline.' },
]

// Inspector tab labels.
export const TAB_HELP: Record<InspectorTab, string> = {
  servers: "Turn the agent's MCP tool servers on and off, and watch the registries update live.",
  trace: 'A timeline of every tool the agent has called this session — name, status, and timing.',
  compare: 'Run the same prompt against two models side by side, with or without tools.',
  try: 'Ready-made prompts to drop into the chat and watch the lab respond.',
  walkthrough: "A guided, step-by-step tour of the lab's core lesson.",
}

// MCP servers — what each one lets the agent do.
export const SERVER_HELP: Record<string, string> = {
  'mcp-user': 'Exposes the user-directory API as MCP tools (list and look up users).',
  'mcp-gitea': 'Git and CI tools: repositories, commits, branches, Actions runs, and tags.',
  'mcp-registry': 'Container-registry tools: list images and tags across the dev, staging, and prod registries.',
  'mcp-promotion':
    'Promotion and policy tools: promote an image between environments, roll back, and read the scan-gate policy.',
  'mcp-runner': 'Pipeline tools: trigger a CI run, run a Trivy scan, and deploy a container.',
}

// MCP server status glyphs.
export const SERVER_STATUS_HELP: Record<string, string> = {
  online: 'Online — this server is running and its tools are available to the agent.',
  degraded: 'Degraded — the server is reachable but reporting trouble; some tools may fail.',
  offline: 'Offline — start it to give the agent these tools.',
}

// The "Flying Blind" toggle — the lab's opening lesson.
export const FLYING_BLIND_HELP =
  'Flying Blind: the model answers with NO tools, so it confidently makes things up. Turn on an MCP server to ground it in real data — then watch the difference.'
