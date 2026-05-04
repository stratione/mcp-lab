export type Lesson = {
  mcp: 'mcp-user' | 'mcp-gitea' | 'mcp-registry' | 'mcp-promotion'
  prompt: string
  probe: { url: string; auth?: 'basic' }
  teach: string
}

export const LESSONS: Lesson[] = [
  {
    mcp: 'mcp-user',
    // Cold-open already asked "list all users" — asking it again here adds no
    // new information. A targeted question ("which user has admin?") forces
    // the model to either invent a specific name (without tools) or filter
    // real data (with the MCP), making the contrast much sharper.
    prompt: 'Which user has the admin role?',
    probe: { url: 'http://localhost:8001/users' },
    teach: 'The user API is unauthenticated and public — the MCP just calls it.',
  },
  {
    mcp: 'mcp-gitea',
    prompt: 'List all repositories in Gitea.',
    probe: { url: 'http://localhost:3000/api/v1/repos/search', auth: 'basic' },
    teach: 'Gitea wants HTTP Basic — the MCP server holds the credentials so the model never sees them.',
  },
  {
    mcp: 'mcp-registry',
    prompt: 'What images are in the dev registry?',
    probe: { url: 'http://localhost:5001/v2/_catalog' },
    teach: 'Registry v2 returns JSON; the MCP unwraps the catalog into a clean list.',
  },
  {
    mcp: 'mcp-promotion',
    prompt: 'List recent image promotions.',
    probe: { url: 'http://localhost:8002/promotions' },
    teach: 'The promotion service tracks every dev→prod copy; without the MCP, the model would invent one.',
  },
]

// 1 welcome + 1 cold-open + 3 cards * 4 MCPs + 1 capstone-hallucinate + 1 capstone-verify + 1 wrap
export const PHASE_COUNT = 1 + 1 + 3 * LESSONS.length + 1 + 1 + 1
