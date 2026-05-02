// Backing-API endpoints for each MCP server.
//
// The "verify" button hits the MCP protocol endpoint, which is fine for
// confirming the SSE server is alive — but it doesn't show what the MCP
// is FOR. The real point of the workshop is "here's an API with data;
// turn the MCP on and watch the LLM read from it; turn it off and watch
// the LLM hallucinate." So next to each server we show clickable links
// to the underlying APIs themselves — open in a tab, see real data.
//
// Refresh this if a new MCP is added or a backing service moves ports.

export type BackingUrl = {
  label: string
  url: string
  hint?: string
  /** Lab credentials for services that have a login (Gitea, etc.).
   *  Rendered as copy-able fields next to the URL. These are not secrets —
   *  they're the seeded workshop credentials baked into the bootstrap. */
  credentials?: { username: string; password: string }
}

const BACKING_URLS: Record<string, BackingUrl[]> = {
  'mcp-user': [
    { label: 'List users', url: 'http://localhost:8001/users', hint: 'JSON of the 6 seeded users' },
    { label: 'List roles', url: 'http://localhost:8001/users/roles', hint: 'JSON of valid role names' },
    { label: 'Swagger UI', url: 'http://localhost:8001/docs', hint: 'browse + try every endpoint' },
  ],
  'mcp-gitea': [
    {
      label: 'Gitea web UI',
      url: 'http://localhost:3000',
      hint: 'click the URL → log in with the credentials below',
      credentials: { username: 'mcpadmin', password: 'mcpadmin123' },
    },
    { label: 'API version', url: 'http://localhost:3000/api/v1/version', hint: 'one-shot health probe (no login)' },
    { label: 'Repo list', url: 'http://localhost:3000/explore/repos', hint: 'browse repos (no login)' },
  ],
  'mcp-registry': [
    { label: 'registry-dev catalog', url: 'http://localhost:5001/v2/_catalog', hint: 'images pushed by builds' },
    { label: 'registry-prod catalog', url: 'http://localhost:5002/v2/_catalog', hint: 'images promoted to prod' },
  ],
  'mcp-promotion': [
    { label: 'Promotion history', url: 'http://localhost:8002/promotions', hint: 'every promote_image call' },
    { label: 'Swagger UI', url: 'http://localhost:8002/docs', hint: 'try POST /promotions yourself' },
  ],
  'mcp-runner': [
    // mcp-runner has no DB of its own; it produces images + deployed
    // containers. The deployed hello-world-app endpoints show its work.
    { label: 'hello world app (dev)', url: 'http://localhost:9080/', hint: 'live after deploy_app dev' },
    { label: 'hello world app (staging)', url: 'http://localhost:9081/', hint: 'live after deploy_app staging' },
    { label: 'hello world app (prod)', url: 'http://localhost:9082/', hint: 'live after deploy_app prod' },
  ],
}

/** Look up backing URLs by either canonical ('mcp-user') or stripped ('user') name. */
export function backingUrlsFor(name: string): BackingUrl[] {
  const canonical = name.startsWith('mcp-') ? name : `mcp-${name}`
  return BACKING_URLS[canonical] ?? []
}
