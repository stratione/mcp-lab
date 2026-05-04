// Per-MCP prompt suggestions — what an attendee can paste/send into the
// chat to exercise each tool family. Powers the "Try" tab in the
// Inspector. Keep these phrased like a human would actually ask, not
// like API method names; the LLM will resolve them to the right tool.
//
// Refresh when a new tool ships or a tool changes shape. The contract:
// every real MCP tool should appear in at least one prompt; no prompt
// should reference a tool that doesn't exist (the test in
// mcp-prompts.test.ts asserts both).

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
    { prompt: 'Look up the user with the username "alice".', tool: 'get_user_by_username' },
    { prompt: 'Create a user named bob with email bob@example.com and the dev role.', tool: 'create_user' },
    { prompt: 'Change diana\'s role to ops.', tool: 'update_user' },
    { prompt: 'Deactivate eve\'s account.', tool: 'deactivate_user' },
    { prompt: 'Re-enable eve\'s account.', tool: 'activate_user' },
    { prompt: 'Delete the user named bob.', tool: 'delete_user', hint: 'destructive — destructive_tools must be enabled' },
  ],
  'mcp-gitea': [
    { prompt: 'List all repositories in Gitea.', tool: 'list_gitea_repos' },
    { prompt: 'Show me details of the sample-app repo owned by mcpadmin.', tool: 'get_gitea_repo' },
    { prompt: 'List branches in mcpadmin/sample-app.', tool: 'list_gitea_branches' },
    { prompt: 'Read app.py from mcpadmin/sample-app.', tool: 'get_gitea_file' },
    { prompt: 'I\'m diana, password diana-lab-123 — create me a repo called diana-experiment.', tool: 'create_gitea_repo', hint: 'MCP authenticates as diana — repo will be hers, not the admin\'s' },
    { prompt: 'As alice (password alice-lab-123), create a branch called feature/v2 in mcpadmin/sample-app, branched from main.', tool: 'create_gitea_branch', hint: 'demo: per-call auth, branch authored by alice' },
    { prompt: 'As alice, add a CHANGELOG.md to feature/v2 in mcpadmin/sample-app with content "v1.0.0 — initial release".', tool: 'create_gitea_file', hint: 'commit author tracks the per-call user' },
  ],
  'mcp-registry': [
    { prompt: 'What registries are configured?', tool: 'list_registries' },
    { prompt: 'What images are in the dev registry?', tool: 'list_registry_images' },
    { prompt: 'Compare what\'s in registry-dev vs registry-prod.', hint: 'two list_registry_images calls' },
    { prompt: 'List all tags for hello-app in registry-dev.', tool: 'list_image_tags' },
    { prompt: 'Show me the manifest digest for hello-app:latest in registry-dev.', tool: 'get_image_manifest', hint: 'digest is the content-hash audit trail' },
    { prompt: 'Tag hello-app:latest as v1.0.0 in registry-dev.', tool: 'tag_image', hint: 'use this before promoting so the prod registry has a versioned tag' },
  ],
  'mcp-promotion': [
    { prompt: 'Promote hello-app:v1.0.0 from dev to prod, performed by alice.', tool: 'promote_image', hint: 'policy gate — alice has admin, so the promotion goes through' },
    { prompt: 'Show me the promotion history.', tool: 'list_promotions' },
    { prompt: 'What\'s the status of the most recent promotion?', tool: 'get_promotion_status' },
  ],
  'mcp-runner': [
    { prompt: 'Build the hello world app.', tool: 'build_image', hint: 'no args needed — defaults to the lab\'s seeded sample-app' },
    { prompt: 'Scan the hello world app image.', tool: 'scan_image' },
    { prompt: 'Deploy the hello world app to dev.', tool: 'deploy_app' },
    { prompt: 'Build, scan, promote, and deploy the hello world app — full pipeline.', hint: 'chains build_image + scan_image + promote_image + deploy_app' },
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

/** Every MCP we ship prompts for. */
export const SUPPORTED_MCPS = Object.keys(PROMPTS)

/** All tool names referenced in PROMPTS — for the alignment test. */
export function allToolsReferenced(): string[] {
  return Object.values(PROMPTS).flatMap((list) =>
    list.flatMap((p) => (p.tool ? [p.tool] : [])),
  )
}
