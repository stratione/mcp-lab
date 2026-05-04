// Workshop step config — the 35-step "full SDLC" walkthrough.
//
// Structure:
//   PHASES groups steps into named acts (Cold open, Identity, Source control,
//   Build & scan, Registry, Promotion, Deploy & verify, Iterate, Wrap).
//   STEPS is the flat ordered list the Workshop dispatcher consumes.
//   PHASE_COUNT is the total step count (kept as the public name even though
//   "phases" and "steps" are now distinct — too many call-sites depend on it).
//
// Each step's `kind` selects the card the dispatcher renders. New tool demos
// should usually be `exercise` cards (a prompt the attendee sends; no live-vs-
// hallucinate contrast). Verify-against-curl cards stay `verify`.

export type McpName =
  | 'mcp-user'
  | 'mcp-gitea'
  | 'mcp-registry'
  | 'mcp-promotion'
  | 'mcp-runner'

export type Step =
  // Phase 0: opening cards.
  | { kind: 'intro' }
  | { kind: 'cold-open'; prompt: string }
  // Phase boundaries: enable an MCP before its tool exercises.
  | { kind: 'enable'; mcp: McpName }
  // Each tool gets one exercise card. The model picks `tool`; the heading
  // gives the audience a one-line "what's happening here".
  | {
      kind: 'exercise'
      heading: string
      prompt: string
      tool: string
      teach?: string
    }
  // Per-MCP verify-against-curl card. We use it once per MCP (not per tool)
  // to keep the workshop moving. `tool` is the tool the model will pick for
  // `prompt`; carrying it on the step lets the coverage test assert every
  // lab tool gets demonstrated somewhere in the walkthrough.
  | {
      kind: 'verify'
      mcp: McpName
      prompt: string
      tool: string
      probe: { url: string; auth?: 'basic' }
      teach: string
    }
  // Capstone: probes localhost:9080 to prove the deployed container is alive.
  | { kind: 'capstone-verify' }
  // Closing summary.
  | { kind: 'wrap' }

export type Phase = {
  id: string
  title: string
  blurb: string
  steps: Step[]
}

// ─── Phases ───────────────────────────────────────────────────────────────

const PHASE_0_COLD_OPEN: Phase = {
  id: 'cold-open',
  title: 'Cold open',
  blurb: 'Watch the model guess before any tools are on.',
  steps: [
    { kind: 'intro' },
    {
      kind: 'cold-open',
      prompt: 'List all users in the system.',
    },
  ],
}

const PHASE_1_IDENTITY: Phase = {
  id: 'identity',
  title: 'Identity & access',
  blurb: 'The user-api is a flat list. Watch read → read-detail → write.',
  steps: [
    { kind: 'enable', mcp: 'mcp-user' },
    {
      kind: 'exercise',
      heading: 'Read — what roles exist?',
      prompt: 'What roles can a user have in this system?',
      tool: 'list_roles',
      teach: 'list_roles tells the model what role values are valid before it tries to create or update users.',
    },
    {
      kind: 'verify',
      mcp: 'mcp-user',
      prompt: 'List every user — name, email, role.',
      tool: 'list_users',
      probe: { url: 'http://localhost:8001/users' },
      teach: 'The user API is unauthenticated and public — the MCP just calls it.',
    },
    {
      kind: 'exercise',
      heading: 'Read — one record',
      prompt: 'Show me alice in detail — full name, email, role, status.',
      tool: 'get_user',
      teach: 'get_user takes a username; the MCP filters the same /users endpoint.',
    },
    {
      kind: 'exercise',
      heading: 'Write — onboard a teammate',
      prompt: 'Onboard a new dev named dave at dave@devops.com with the dev role.',
      tool: 'create_user',
      teach: 'create_user requires role; the MCP\'s docstring tells the model to call list_roles first.',
    },
    {
      kind: 'exercise',
      heading: 'Write — update a record',
      prompt: 'Promote dave to the admin role.',
      tool: 'update_user',
      teach: 'update_user PATCHes only the fields the model passes; everything else is preserved.',
    },
  ],
}

const PHASE_2_SOURCE: Phase = {
  id: 'source-control',
  title: 'Source control',
  blurb: 'Reads first. Then per-call auth — different humans, same MCP.',
  steps: [
    { kind: 'enable', mcp: 'mcp-gitea' },
    {
      kind: 'exercise',
      heading: 'Read — what repos exist?',
      prompt: 'List every repository in Gitea.',
      tool: 'list_gitea_repos',
      teach: 'Gitea uses HTTP Basic; the MCP holds the credentials so the model never sees them.',
    },
    {
      kind: 'verify',
      mcp: 'mcp-gitea',
      prompt: 'Tell me more about mcpadmin/sample-app — description, default branch, web URL.',
      tool: 'get_gitea_repo',
      probe: { url: 'http://localhost:3000/api/v1/repos/search', auth: 'basic' },
      teach: 'Same data the MCP returned, but raw — see the auth requirement on the curl line.',
    },
    {
      kind: 'exercise',
      heading: 'Read — peek at the source',
      prompt: 'Show me the contents of app.py from mcpadmin/sample-app.',
      tool: 'get_gitea_file',
      teach: 'Proof-of-source moment: the model can show the actual file the build will compile.',
    },
    {
      kind: 'exercise',
      heading: 'Read — what branches exist?',
      prompt: 'List all branches in mcpadmin/sample-app.',
      tool: 'list_gitea_branches',
      teach: 'Branches are how you stage code changes before promotion.',
    },
    {
      kind: 'exercise',
      heading: 'Per-call auth — diana acts',
      prompt: 'I am diana, password diana-lab-123. Create me a repo called diana-experiment with description "exploring the lab".',
      tool: 'create_gitea_repo',
      teach: 'The MCP authenticates as diana for this one call. The repo will be owned by diana, not by mcpadmin.',
    },
    {
      kind: 'exercise',
      heading: 'Per-call auth — alice acts',
      prompt: 'As alice (password alice-lab-123), create a branch called feature/v2 in mcpadmin/sample-app, branched from main.',
      tool: 'create_gitea_branch',
      teach: 'Different identity, same MCP — the audit trail in Gitea records alice as the author.',
    },
    {
      kind: 'exercise',
      heading: 'Per-call auth — alice writes',
      prompt: 'As alice, add a CHANGELOG.md file to feature/v2 in mcpadmin/sample-app with content "v1.0.0 — initial release".',
      tool: 'create_gitea_file',
      teach: 'Files written through MCP show up as commits authored by whoever is on the call.',
    },
  ],
}

const PHASE_3_BUILD: Phase = {
  id: 'build-scan',
  title: 'Build & scan',
  blurb: 'Source → image. The runner clones, builds, and pushes.',
  steps: [
    { kind: 'enable', mcp: 'mcp-runner' },
    {
      kind: 'exercise',
      heading: 'Build — clone + compile + push',
      prompt: 'Build the hello world app from sample-app.',
      tool: 'build_image',
      teach: 'No args needed — defaults to mcpadmin/sample-app. Outputs hello-app:latest in registry-dev.',
    },
    {
      kind: 'exercise',
      heading: 'Scan — security report',
      prompt: 'Scan hello-app:latest for vulnerabilities.',
      tool: 'scan_image',
      teach: 'scan_image is a mock CVE report. PASSED means no critical CVEs; FAILED would gate the promotion.',
    },
  ],
}

const PHASE_4_REGISTRY: Phase = {
  id: 'registry',
  title: 'Registry & artifacts',
  blurb: 'Inspect what was just built. Tag it for release.',
  steps: [
    { kind: 'enable', mcp: 'mcp-registry' },
    {
      kind: 'exercise',
      heading: 'Read — what registries are configured?',
      prompt: 'What registries can I push to? List both, then list every image in each.',
      tool: 'list_registries',
      teach: 'Two registries: dev (where builds land) and prod (gated by promotion).',
    },
    {
      kind: 'verify',
      mcp: 'mcp-registry',
      prompt: 'What images and tags are in the dev registry?',
      tool: 'list_registry_images',
      probe: { url: 'http://localhost:5001/v2/_catalog' },
      teach: 'Registry v2 returns JSON; the MCP unwraps the catalog into a clean list.',
    },
    {
      kind: 'exercise',
      heading: 'Read — tags for hello-app',
      prompt: 'List all tags for hello-app in registry-dev.',
      tool: 'list_image_tags',
      teach: 'Always check tags before assuming :latest — promotion fails on a missing tag.',
    },
    {
      kind: 'exercise',
      heading: 'Read — manifest digest (audit trail)',
      prompt: 'Show me the manifest for hello-app:latest in registry-dev — I want the digest.',
      tool: 'get_image_manifest',
      teach: 'The digest is the image\'s content hash. Two pushes of the same code produce the same digest.',
    },
    {
      kind: 'exercise',
      heading: 'Write — mark a release',
      prompt: 'Tag hello-app:latest as v1.0.0 in registry-dev.',
      tool: 'tag_image',
      teach: 'Now :latest and :v1.0.0 point at the same digest. Promotions reference :v1.0.0 explicitly.',
    },
  ],
}

const PHASE_5_PROMOTION: Phase = {
  id: 'promotion',
  title: 'Promotion (gated)',
  blurb: 'Dev → prod is policy-gated. The promoter\'s identity matters.',
  steps: [
    { kind: 'enable', mcp: 'mcp-promotion' },
    {
      kind: 'verify',
      mcp: 'mcp-promotion',
      prompt: 'Show me recent image promotions — the audit log.',
      tool: 'list_promotions',
      probe: { url: 'http://localhost:8002/promotions' },
      teach: 'The promotion service tracks every dev→prod copy; without the MCP, the model would invent one.',
    },
    {
      kind: 'exercise',
      heading: 'Promote — gated by user role',
      prompt: 'Promote hello-app:v1.0.0 from dev to prod, performed by alice.',
      tool: 'promote_image',
      teach: 'Policy check: alice has the admin role, so the promotion goes through. Try with bob (dev) and it would be rejected.',
    },
    {
      kind: 'exercise',
      heading: 'Verify — did the promotion stick?',
      prompt: 'What\'s the status of the most recent promotion?',
      tool: 'get_promotion_status',
      teach: 'Confirms the policy check passed and the image actually copied to registry-prod.',
    },
  ],
}

const PHASE_6_DEPLOY: Phase = {
  id: 'deploy',
  title: 'Deploy & verify',
  blurb: 'Pull, run, expose. End-to-end proof.',
  steps: [
    {
      kind: 'exercise',
      heading: 'Deploy — start the container',
      prompt: 'Deploy hello-app:v1.0.0 to dev.',
      tool: 'deploy_app',
      teach: 'The runner pulls the image (via skopeo to bypass DNS), loads it, and starts a container on port 9080.',
    },
    { kind: 'capstone-verify' },
  ],
}

const PHASE_7_ITERATE: Phase = {
  id: 'iterate',
  title: 'Iterate — ship v2',
  blurb: 'The whole point of dev/prod separation: ship a second version.',
  steps: [
    {
      kind: 'exercise',
      heading: 'Iterate — change the source',
      prompt: 'As alice, update app.py on the feature/v2 branch of mcpadmin/sample-app so the version field returns "2.0.0" instead of "1.0.0".',
      tool: 'create_gitea_file',
      teach: 'Same MCP, new commit. Real SDLC: code change first, then build, then promote.',
    },
    {
      kind: 'exercise',
      heading: 'Iterate — rebuild as v2.0.0',
      prompt: 'Rebuild hello-app from sample-app — pass tag="v2.0.0" to build_image so the new image lands in registry-dev as hello-app:v2.0.0 (default tag is "latest", which would clobber v1).',
      tool: 'build_image',
      teach: 'build_image takes a tag argument. For releases, set it explicitly so the registry has a versioned tag, not just :latest.',
    },
    {
      kind: 'exercise',
      heading: 'Iterate — promote and redeploy',
      prompt: 'Promote hello-app:v2.0.0 from dev to prod as alice (password alice-lab-123), then deploy hello-app:v2.0.0 to the dev environment so the running container picks up v2.',
      tool: 'promote_image + deploy_app',
      teach: 'Two tool calls in one prompt. Re-probe localhost:9080 — the JSON now shows "version": "2.0.0" instead of "1.0.0".',
    },
  ],
}

const PHASE_8_WRAP: Phase = {
  id: 'wrap',
  title: 'Wrap',
  blurb: 'You exercised every tool in the lab — here\'s the recap.',
  steps: [{ kind: 'wrap' }],
}

export const PHASES: Phase[] = [
  PHASE_0_COLD_OPEN,
  PHASE_1_IDENTITY,
  PHASE_2_SOURCE,
  PHASE_3_BUILD,
  PHASE_4_REGISTRY,
  PHASE_5_PROMOTION,
  PHASE_6_DEPLOY,
  PHASE_7_ITERATE,
  PHASE_8_WRAP,
]

export const STEPS: Step[] = PHASES.flatMap((p) => p.steps)

// Total step count. Public name kept as PHASE_COUNT because every existing
// caller treats "phase" and "step" as synonyms.
export const PHASE_COUNT = STEPS.length

/** Find which phase a step index belongs to (for the dock header label). */
export function phaseFor(stepIndex: number): Phase {
  let cursor = 0
  for (const phase of PHASES) {
    cursor += phase.steps.length
    if (stepIndex < cursor) return phase
  }
  return PHASES[PHASES.length - 1]
}

/** Every MCP that gets enabled somewhere in the walkthrough. */
export const ENABLED_MCPS: McpName[] = STEPS.flatMap((s) =>
  s.kind === 'enable' ? [s.mcp] : [],
)

/**
 * MCPs that should be online by the time the attendee is at `stepIndex`
 * (used by the CmdK "catch me up" action — flips on every MCP whose
 * enable step is at or before the current step).
 */
export function mcpsExpectedOnlineAt(stepIndex: number): McpName[] {
  const out: McpName[] = []
  STEPS.forEach((s, i) => {
    if (s.kind === 'enable' && i <= stepIndex) out.push(s.mcp)
  })
  return out
}
