// Per-tool verification map.
//
// For each MCP tool that has an observable side effect (a row in a database,
// an image in a registry, a running container, a commit in Gitea), this
// module returns the URL the user can hit to confirm the LLM actually did
// what it said. The UI exposes those as "Verify" buttons on tool-call cards
// so attendees never have to take the model's word for it.
//
// URLs are localhost-from-host (the chat-ui's /api/probe rewrites them to
// docker-network-internal hostnames before fetching). Tools without a
// verifiable source — pure mocks like scan_image — return null, and the
// Verify button doesn't render for them.

export type VerifySpec = {
  /** Build the URL to probe from the tool-call args. */
  url: (args: Record<string, unknown>) => string
  /**
   * Short teaching note shown alongside the verify result. Keep tight —
   * one sentence describing what the URL proves.
   */
  hint: string
}

// Both registries listen on container :5000; host port 5001 = dev, 5002 = prod.
function regPort(reg: unknown): number {
  return reg === 'prod' ? 5002 : 5001
}

// Deploy environment → host port mapping (matches deploy_tools.ENV_PORTS).
function envPort(env: unknown): number {
  if (env === 'prod') return 9082
  if (env === 'staging') return 9081
  return 9080
}

const str = (v: unknown, fallback = ''): string =>
  typeof v === 'string' ? v : fallback

const VERIFY: Record<string, VerifySpec> = {
  // ─── mcp-user ──────────────────────────────────────────────────────────
  list_users: {
    url: () => 'http://localhost:8001/users',
    hint: 'GET /users on the user-api — the same list the LLM just got.',
  },
  list_roles: {
    url: () => 'http://localhost:8001/users/roles',
    hint: 'The valid role values create_user / update_user accept.',
  },
  get_user: {
    url: (a) => `http://localhost:8001/users/${a.user_id ?? ''}`,
    hint: 'Single-user lookup, raw — confirms the JSON the LLM summarized.',
  },
  get_user_by_username: {
    url: (a) => `http://localhost:8001/users/by-username/${str(a.username)}`,
    hint: 'Confirms the user exists and the LLM read the right record.',
  },
  create_user: {
    url: () => 'http://localhost:8001/users',
    hint: 'Re-list users — the new one should appear in the array.',
  },
  update_user: {
    url: (a) => `http://localhost:8001/users/${a.user_id ?? ''}`,
    hint: 'Refetch the user — the patched fields should match what the LLM said.',
  },
  deactivate_user: {
    url: (a) => `http://localhost:8001/users/${a.user_id ?? ''}`,
    hint: 'is_active should now be false on this user.',
  },
  activate_user: {
    url: (a) => `http://localhost:8001/users/${a.user_id ?? ''}`,
    hint: 'is_active should now be true on this user.',
  },
  delete_user: {
    url: () => 'http://localhost:8001/users',
    hint: 'Re-list users — the deleted id should be gone.',
  },

  // ─── mcp-gitea ─────────────────────────────────────────────────────────
  // Gitea's API may require basic auth for some endpoints; the probe will
  // surface a 401 there, which is itself the lesson ("the MCP holds the
  // credentials, not you").
  list_gitea_repos: {
    url: () => 'http://localhost:3000/api/v1/repos/search?limit=50',
    hint: 'Same data straight from Gitea. May 401 — the MCP injects auth on your behalf.',
  },
  get_gitea_repo: {
    url: (a) => `http://localhost:3000/api/v1/repos/${str(a.owner)}/${str(a.repo)}`,
    hint: 'The single repo record Gitea returns.',
  },
  list_gitea_branches: {
    url: (a) => `http://localhost:3000/api/v1/repos/${str(a.owner)}/${str(a.repo)}/branches`,
    hint: 'Branches array — the new one (if you just created one) should be in here.',
  },
  get_gitea_file: {
    url: (a) => {
      const owner = str(a.owner)
      const repo = str(a.repo)
      const path = str(a.filepath ?? a.path)
      const ref = str(a.ref ?? a.branch ?? 'main')
      return `http://localhost:3000/api/v1/repos/${owner}/${repo}/raw/${path}?ref=${ref}`
    },
    hint: 'Raw file contents from Gitea — what the LLM read.',
  },
  create_gitea_repo: {
    url: (a) => `http://localhost:3000/api/v1/repos/${str(a.owner ?? a.username)}/${str(a.repo ?? a.name)}`,
    hint: 'Confirms the repo now exists and is owned by the user the MCP committed as.',
  },
  create_gitea_branch: {
    url: (a) => `http://localhost:3000/api/v1/repos/${str(a.owner)}/${str(a.repo)}/branches`,
    hint: 'New branch should appear in the list.',
  },
  create_gitea_file: {
    url: (a) => {
      const owner = str(a.owner)
      const repo = str(a.repo)
      const path = str(a.filepath ?? a.path)
      const ref = str(a.branch ?? 'main')
      return `http://localhost:3000/api/v1/repos/${owner}/${repo}/raw/${path}?ref=${ref}`
    },
    hint: 'Raw fetch of the file the LLM just wrote — proves the commit landed.',
  },

  // ─── mcp-registry ──────────────────────────────────────────────────────
  list_registries: {
    url: () => 'http://localhost:5001/v2/_catalog',
    hint: 'Dev registry catalog — list of repos the registry knows about.',
  },
  list_registry_images: {
    url: (a) => `http://localhost:${regPort(a.registry)}/v2/_catalog`,
    hint: 'Registry v2 _catalog — same data, untransformed.',
  },
  list_image_tags: {
    url: (a) =>
      `http://localhost:${regPort(a.registry)}/v2/${str(a.image_name ?? a.image)}/tags/list`,
    hint: 'Tags array straight from the registry. The promoted/built tag should be present.',
  },
  get_image_manifest: {
    url: (a) =>
      `http://localhost:${regPort(a.registry)}/v2/${str(a.image_name ?? a.image)}/manifests/${str(a.tag, 'latest')}`,
    hint: 'Raw manifest — note the schemaVersion / config digest.',
  },
  tag_image: {
    url: (a) =>
      `http://localhost:${regPort(a.registry)}/v2/${str(a.image_name ?? a.image)}/tags/list`,
    hint: 'Re-list tags — the new tag the LLM just created should be in here now.',
  },

  // ─── mcp-promotion ─────────────────────────────────────────────────────
  promote_image: {
    url: () => 'http://localhost:8002/promotions',
    hint: 'Audit log on the promotion service — the new row should be at the top.',
  },
  list_promotions: {
    url: () => 'http://localhost:8002/promotions',
    hint: 'Same data the LLM read.',
  },
  get_promotion_status: {
    url: (a) => `http://localhost:8002/promotions/${a.promotion_id ?? ''}`,
    hint: 'Single-promotion record — status / policy_check / digest.',
  },

  // ─── mcp-runner ────────────────────────────────────────────────────────
  build_image: {
    url: (a) =>
      `http://localhost:5001/v2/${str(a.image_name, 'hello-app')}/tags/list`,
    hint: 'Tags in registry-dev — proves the freshly built image landed.',
  },
  // scan_image is a pure mock; no source-of-truth URL. Verify button
  // suppressed by absence from this map.
  deploy_app: {
    url: (a) => `http://localhost:${envPort(a.environment)}/`,
    hint: 'Hits the running container directly. The body should match what the app serves.',
  },
}

/** Lookup; returns null when no verifier is registered for this tool. */
export function verifyFor(toolName: string): VerifySpec | null {
  return VERIFY[toolName] ?? null
}
