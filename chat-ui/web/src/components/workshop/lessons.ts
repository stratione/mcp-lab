export type Lesson = {
  mcp: 'mcp-user' | 'mcp-gitea' | 'mcp-registry' | 'mcp-promotion'
  prompt: string
  probe: { url: string; auth?: 'basic' }
  teach: string
}

export const LESSONS: Lesson[] = [
  {
    mcp: 'mcp-user',
    prompt: 'List all users in the system.',
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

// 1 welcome + 1 cold-open + 3 cards * 4 MCPs + 1 capstone + 1 wrap
export const PHASE_COUNT = 1 + 1 + 3 * LESSONS.length + 1 + 1
