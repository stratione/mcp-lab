// Per-MCP prompt suggestions — what an attendee can paste/send into the
// chat to exercise each tool family. Powers the "Try" tab in the
// Inspector. Keep these phrased like a human would actually ask, not
// like API method names; the LLM will resolve them to the right tool.
//
// Refresh when a new tool ships or a tool changes shape.

export type PromptSuggestion = {
  prompt: string
  tool?: string  // optional: the underlying MCP tool the LLM will pick
  hint?: string  // optional: one-line context for the workshop attendee
}

const PROMPTS: Record<string, PromptSuggestion[]> = {
  'mcp-user': [
    { prompt: 'List all users in the system.', tool: 'list_users' },
    { prompt: 'What roles can a user have?', tool: 'list_roles' },
    { prompt: 'Show me the user with id 1.', tool: 'get_user' },
    { prompt: 'Create a user named bob with email bob@example.com and the dev role.', tool: 'create_user' },
    { prompt: 'Change diana\'s role to ops.', tool: 'update_user' },
    { prompt: 'Deactivate eve\'s account.', tool: 'deactivate_user' },
    { prompt: 'Re-enable eve\'s account.', tool: 'activate_user' },
  ],
  'mcp-gitea': [
    { prompt: 'List all repositories in Gitea.', tool: 'list_repos' },
    { prompt: 'Show me the latest commits in the hello world app repo.', tool: 'list_commits' },
    { prompt: 'List branches in the hello world app.', tool: 'list_branches' },
    { prompt: 'Read the README of the hello world app.', tool: 'get_file' },
  ],
  'mcp-registry': [
    { prompt: 'What images are in the dev registry?', tool: 'list_images' },
    { prompt: 'List all tags for the hello world app in registry-dev.', tool: 'list_tags' },
    { prompt: 'Compare what\'s in registry-dev vs registry-prod.', hint: 'two list_images calls' },
  ],
  'mcp-promotion': [
    { prompt: 'Promote the hello world app from dev to prod.', tool: 'promote_image' },
    { prompt: 'Show me the promotion history.', tool: 'list_promotions' },
    { prompt: 'Roll back the last promotion.', tool: 'rollback_promotion' },
  ],
  'mcp-runner': [
    { prompt: 'Build the hello world app.', tool: 'build_image', hint: 'no args needed — defaults to the lab\'s seeded app' },
    { prompt: 'Scan the hello world app image.', tool: 'scan_image' },
    { prompt: 'Deploy the hello world app to dev.', tool: 'deploy_app' },
    { prompt: 'Build and deploy the hello world app — full pipeline.', hint: 'chains build + deploy' },
  ],
}

/** Look up suggestions by either canonical ('mcp-user') or stripped ('user') name. */
export function promptsFor(name: string): PromptSuggestion[] {
  const canonical = name.startsWith('mcp-') ? name : `mcp-${name}`
  return PROMPTS[canonical] ?? []
}

/** Friendly title for each MCP — used as the section header in the Try tab. */
export function titleFor(name: string): string {
  const canonical = name.startsWith('mcp-') ? name : `mcp-${name}`
  return {
    'mcp-user': 'Users',
    'mcp-gitea': 'Git / Gitea',
    'mcp-registry': 'Container registries',
    'mcp-promotion': 'Image promotion',
    'mcp-runner': 'CI/CD runner',
  }[canonical] ?? canonical
}
