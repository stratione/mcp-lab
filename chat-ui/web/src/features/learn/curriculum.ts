// Learn Mode course content — the 8-module curriculum distilled for the
// in-app lesson pane. docs/CURRICULUM.md stays the canonical long-form text;
// every command here is copied from it VERBATIM (don't paraphrase shell).
// Module 8 (build your own MCP tool) is authored here and in CURRICULUM.md
// together — keep them in sync.

export type LearnStep = {
  id: string
  /** Picks the card accent. */
  kind: 'concept' | 'hand' | 'agent' | 'drill'
  title: string
  body: string
  /** Each entry renders as one copyable shell block. */
  commands?: string[]
  expected?: string
  /** For agent steps: the prompt to paste (or send) into the chat. */
  agentPrompt?: string
}

export type LearnModule = {
  num: number
  slug: string
  title: string
  tagline: string
  /** What `labctl check <num>` / the Verify button proves. */
  checkMeans: string
  steps: LearnStep[]
}

export const LEARN_MODULES: LearnModule[] = [
  {
    num: 1,
    slug: 'git',
    title: 'Git & collaboration',
    tagline: 'Every artifact traces back to a commit.',
    checkMeans: 'sample-app is reachable in Gitea and main has more than one commit.',
    steps: [
      {
        id: '1.concept',
        kind: 'concept',
        title: 'Why Git first',
        body:
          'Every artifact in a delivery pipeline traces back to a commit — Git is the audit trail everything else hangs on. Branches let teams work in parallel; pushes to a shared remote (here: Gitea, a self-hosted GitHub-alike) trigger everything downstream.',
      },
      {
        id: '1.hand-clone',
        kind: 'hand',
        title: 'Clone the seeded sample app',
        body:
          'Credentials embedded in the URL — fine for a lab on localhost, a firing offense in production.',
        commands: [
          'git clone http://mcpadmin:mcpadmin123@localhost:3000/mcpadmin/sample-app.git\ncd sample-app\ngit log --oneline',
        ],
        expected: 'The bootstrap seeded app.py + Dockerfile for you.',
      },
      {
        id: '1.hand-branch',
        kind: 'hand',
        title: 'Change something on a branch',
        body:
          'Open app.py in your editor and change the response message, then commit and push the branch. Then open http://localhost:3000/mcpadmin/sample-app, create a pull request from feature/my-greeting into main, and merge it.',
        commands: [
          'git checkout -b feature/my-greeting\n# edit app.py, then:\ngit add app.py\ngit commit -m "Change greeting"\ngit push -u origin feature/my-greeting',
        ],
      },
      {
        id: '1.hand-survey',
        kind: 'hand',
        title: 'Survey the lab repos',
        body: '--verbose prints the raw curl against the Gitea API. No magic.',
        commands: ['./labctl repos\n./labctl --verbose repos'],
      },
      {
        id: '1.agent',
        kind: 'agent',
        title: 'Same job, by agent',
        body: 'Bring the Git tools online, then hand the chat the job you just did by hand.',
        commands: ['docker compose up -d mcp-gitea'],
        agentPrompt:
          'Create a branch called feature/agent-edit in mcpadmin/sample-app, update the greeting in app.py on that branch, commit it with a sensible message, and then show me the five most recent commits on main.',
      },
    ],
  },
  {
    num: 2,
    slug: 'ci',
    title: 'CI pipelines as code',
    tagline: 'The pipeline is a YAML file you review like any other change.',
    checkMeans:
      'The workflow file exists, the latest Actions run succeeded, and hello-app is in the dev registry.',
    steps: [
      {
        id: '2.concept',
        kind: 'concept',
        title: 'Pipelines stopped being a Jenkins page',
        body:
          'CI means every push is automatically tested and built — and the pipeline itself is code, versioned next to the app. The lab runs real Gitea Actions with a registered runner container; jobs execute inside mcp-lab-ci-base:latest with the Docker socket mounted.',
      },
      {
        id: '2.hand-workflow',
        kind: 'hand',
        title: 'Write the workflow file yourself',
        body:
          'Create .gitea/workflows/ci.yml in your sample-app working copy. Type the canonical content from docs/CURRICULUM.md module 2 (Clone → Test → Build image → Push to dev registry → Notify chat-ui) and read its line-by-line tour until every line is boring to you. Key beats: jobs start empty (the Clone step is explicit), a failing Test step means no image is built, and CI pushes to dev only — promotion owns staging/prod.',
        commands: ['mkdir -p .gitea/workflows\n$EDITOR .gitea/workflows/ci.yml'],
      },
      {
        id: '2.hand-push',
        kind: 'hand',
        title: 'Push it — that push triggers the first run',
        body: 'Watch the run from the terminal, or in the browser under the repo’s Actions tab.',
        commands: [
          'git add .gitea/workflows/ci.yml\ngit commit -m "Add CI pipeline"\ngit push',
          './labctl runs sample-app --watch',
        ],
      },
      {
        id: '2.hand-prove',
        kind: 'hand',
        title: 'Prove the artifact landed',
        body: 'You should see hello-app with latest plus a 40-character sha tag.',
        commands: [
          'curl -s http://localhost:5001/v2/_catalog\ncurl -s http://localhost:5001/v2/hello-app/tags/list',
        ],
      },
      {
        id: '2.agent',
        kind: 'agent',
        title: 'Same job, by agent',
        body: 'The agent uses the Gitea Actions tools plus the registry tools — same APIs you just curled.',
        commands: ['docker compose up -d mcp-gitea mcp-registry'],
        agentPrompt:
          'Look at the most recent CI run on mcpadmin/sample-app. Did it pass? Summarize what each step did, and confirm that the hello-app image it built is now in the dev registry with both a latest tag and a sha tag.',
      },
      {
        id: '2.drill',
        kind: 'drill',
        title: 'Break-fix drill: dockerfile-typo',
        body:
          'CI’s job is to fail loudly before bad changes ship. This commits FROM pythn:3.12-alpine; the run fails at Build image, and no new sha tag reaches dev — the broken commit never produced an artifact. Diagnose in the run logs, then fix.',
        commands: [
          './labctl break dockerfile-typo\n./labctl runs sample-app --watch',
          './labctl fix dockerfile-typo\n./labctl runs sample-app --watch',
        ],
      },
    ],
  },
  {
    num: 3,
    slug: 'artifacts',
    title: 'Artifacts & registries',
    tagline: 'Tags drift, digests don’t.',
    checkMeans: 'A non-latest, non-SHA tag exists for hello-app in the dev registry.',
    steps: [
      {
        id: '3.concept',
        kind: 'concept',
        title: 'Tags vs digests',
        body:
          'A tag (latest, v1.0.0) is a mutable pointer — anyone can move it. A digest (sha256:…) is the content-addressed identity of the image — it can never change. Mature shops promote and deploy by digest; supply-chain security is built on this distinction. The lab runs three registries: dev :5001, staging :5003, prod :5002.',
      },
      {
        id: '3.hand-list',
        kind: 'hand',
        title: 'Look under a tag',
        body: 'The registry HTTP API returns the manifest digest as a header. Run the same check on the sha tag from module 2 — same digest. Two tags, one artifact.',
        commands: [
          './labctl images -r dev\n./labctl tags hello-app -r dev',
          "curl -sI -H 'Accept: application/vnd.docker.distribution.manifest.v2+json' \\\n  http://localhost:5001/v2/hello-app/manifests/latest | grep -i docker-content-digest",
        ],
      },
      {
        id: '3.hand-retag',
        kind: 'hand',
        title: 'Cut a release tag',
        body:
          'Retagging is just re-pointing — no bytes copied. The → raw: lines show the trick: GET the manifest for latest, PUT the identical manifest under v1.0.0. Tomorrow CI moves latest; v1.0.0 stays nailed to this exact build forever.',
        commands: [
          './labctl --verbose retag hello-app:latest v1.0.0 -r dev',
          './labctl tags hello-app -r dev',
        ],
      },
      {
        id: '3.agent',
        kind: 'agent',
        title: 'Same job, by agent',
        body: '',
        commands: ['docker compose up -d mcp-registry'],
        agentPrompt:
          'List every image and tag in the dev registry. Then explain which tags of hello-app point at the same digest, and create a new tag v1.0.1 of hello-app:latest in dev.',
      },
    ],
  },
  {
    num: 4,
    slug: 'security',
    title: 'Security scanning',
    tagline: 'A build that fails policy can’t move toward production.',
    checkMeans: 'At least one scan is recorded and the latest hello-app scan passed policy.',
    steps: [
      {
        id: '4.concept',
        kind: 'concept',
        title: 'Your image is more than your code',
        body:
          'Base OS, language runtime, system libraries — every layer carries published CVEs. Trivy matches your image against vulnerability databases and reports by severity. The lab runs Trivy in client/server mode; the policy is pass iff critical <= 0, computed server-side — clients can’t sweet-talk it.',
      },
      {
        id: '4.hand-scan',
        kind: 'hand',
        title: 'Scan the image CI built',
        body:
          'The → raw: line shows a throwaway trivy client container joining the lab network and asking the trivy server to scan the image straight out of the dev registry. labctl also POSTs the scan record to the promotion service — the recorded scan is what module 5’s policy gate reads.',
        commands: [
          './labctl status\ndocker compose --profile security up -d trivy',
          './labctl --verbose scan hello-app:latest -r dev',
        ],
      },
      {
        id: '4.hand-read',
        kind: 'hand',
        title: 'Read the results like a report',
        body:
          'Per finding: VulnerabilityID, PkgName + InstalledVersion, FixedVersion (empty = no fix released), Severity. HIGHs without fixes on an alpine base are normal life; criticals are not.',
        commands: ['./labctl scans\n./labctl scan-report <id>'],
      },
      {
        id: '4.agent',
        kind: 'agent',
        title: 'Same job, by agent',
        body: '',
        commands: ['docker compose up -d mcp-runner mcp-promotion'],
        agentPrompt:
          'Scan hello-app:latest in the dev registry, summarize the vulnerabilities by severity, and tell me whether this image would pass our promotion policy — and what that policy is.',
      },
      {
        id: '4.drill',
        kind: 'drill',
        title: 'Break-fix drill: vulnerable-base',
        body:
          'The uncomfortable part: CI goes green — nothing about a build step knows the base image is a museum piece. The scan catches it, and the promotion gate refuses with HTTP 409. The fix is a newer base, not a patch.',
        commands: [
          './labctl break vulnerable-base\n./labctl runs sample-app --watch\n./labctl scan hello-app:latest -r dev',
          './labctl fix vulnerable-base\n./labctl runs sample-app --watch\n./labctl scan hello-app:latest -r dev',
        ],
      },
    ],
  },
  {
    num: 5,
    slug: 'promotion',
    title: 'Environments & promotion',
    tagline: 'Build once, promote many — gated and audited.',
    checkMeans: 'hello-app is present in both staging and prod, with audit rows.',
    steps: [
      {
        id: '5.concept',
        kind: 'concept',
        title: 'dev → staging → prod',
        body:
          'Promotion moves the same bytes (the digest, not a rebuild) between environments, and every move is gated and audited. The lab enforces a three-stage flow with a scan gate that re-attests per environment, bound to the manifest digest — a scan can’t be forged by re-pointing a tag.',
      },
      {
        id: '5.hand-policy',
        kind: 'hand',
        title: 'Ask the service its rules — then test the fence',
        body: 'The illegal hop first: dev→prod is refused with a 409 in a three-stage flow.',
        commands: ['./labctl policy', './labctl promote hello-app:latest --to prod'],
      },
      {
        id: '5.hand-hops',
        kind: 'hand',
        title: 'Take both hops properly',
        body:
          'The staging→prod hop asks "has THIS image been scanned in staging?" — nothing has yet, so it 409s until you re-attest where the image now lives. Promotion preserves the digest, so the staging scan covers the very same bytes — cheap re-attestation, not a rebuild.',
        commands: [
          './labctl promote hello-app:latest --to staging --by <your-name>',
          './labctl scan hello-app:latest -r staging\n./labctl promote hello-app:latest --to prod --by <your-name>',
        ],
      },
      {
        id: '5.hand-audit',
        kind: 'hand',
        title: 'Inspect the trail and the warehouses',
        body: 'Optional but satisfying: the module 3 digest check against all three registries — identical digest. Same bytes, promoted, not rebuilt.',
        commands: [
          './labctl promotions\n./labctl images -r staging\n./labctl images -r prod',
        ],
      },
      {
        id: '5.agent',
        kind: 'agent',
        title: 'Same job, by agent',
        body: 'Watch for the right dance: policy → scan the source registry → promote → verify, twice.',
        commands: ['docker compose up -d mcp-promotion mcp-registry'],
        agentPrompt:
          'Promote hello-app:latest from dev to staging and then from staging to prod. The scan gate re-attests per environment, so before each hop scan the image in that hop’s source registry (dev for the first hop, staging for the second), then promote. Afterwards, show me the audit trail of all promotions.',
      },
      {
        id: '5.drill',
        kind: 'drill',
        title: 'Break-fix drill: failing-test',
        body:
          'Break the earliest gate and watch the whole downstream starve: the Test step fails, so no new image reaches dev — nothing to scan, nothing to promote. The broken change is quarantined at the first gate.',
        commands: [
          './labctl break failing-test\n./labctl runs sample-app --watch',
          './labctl fix failing-test\n./labctl runs sample-app --watch',
        ],
      },
    ],
  },
  {
    num: 6,
    slug: 'deploy',
    title: 'Deploy & operate',
    tagline: 'Prod runs what’s in the prod registry, full stop.',
    checkMeans: 'An mcp-lab-app-* container is running and its /health returns 200.',
    steps: [
      {
        id: '6.concept',
        kind: 'concept',
        title: 'Conventions earn their keep',
        body:
          'Deployment turns artifacts into running processes. The lab convention: container mcp-lab-app-<env>, host ports 9080/9081/9082 (dev/staging/prod), labeled and attached to the lab network — and the image is pulled from the registry matching the environment. The only road into prod runs through the gates.',
      },
      {
        id: '6.hand-deploy',
        kind: 'hand',
        title: 'Deploy what you promoted',
        body: 'The → raw: lines decompose into a docker pull from localhost:5002 (the prod registry) and a docker run with the naming/label convention.',
        commands: ['./labctl --verbose deploy hello-app:latest --env prod'],
      },
      {
        id: '6.hand-operate',
        kind: 'hand',
        title: 'Operate it',
        body: 'Health endpoints and logs are the operator’s first two instruments.',
        commands: [
          'curl -s http://localhost:9082/health\ncurl -s http://localhost:9082/\n./labctl deployments\n./labctl applogs prod',
        ],
      },
      {
        id: '6.agent',
        kind: 'agent',
        title: 'Same job, by agent',
        body: '',
        commands: ['docker compose up -d mcp-runner'],
        agentPrompt:
          'Deploy hello-app:latest to the prod environment, then verify it’s healthy and show me its recent logs.',
      },
    ],
  },
  {
    num: 7,
    slug: 'ops',
    title: 'Day-2 ops',
    tagline: 'The most valuable capability in an incident is a fast, boring rollback.',
    checkMeans: 'At least one rollback audit row exists.',
    steps: [
      {
        id: '7.concept',
        kind: 'concept',
        title: 'Everything after the launch party',
        body:
          'Incidents, rollbacks, and the audit trail that reconstructs what happened under pressure. Rollback re-points production to the previous known-good artifact — by digest — while humans debug at leisure. Every action leaves an audit row, because the post-incident review will ask.',
      },
      {
        id: '7.hand-v2',
        kind: 'hand',
        title: 'Ship a second release (modules 1–5 in two minutes)',
        body: 'Prod needs history to roll back to. Bump something visible in app.py, then run the practiced loop and feel it compress.',
        commands: [
          'cd sample-app\n# bump app.py, then:\ngit add app.py && git commit -m "v2 release" && git push\n./labctl runs sample-app --watch\n./labctl scan hello-app:latest -r dev\n./labctl promote hello-app:latest --to staging --by <your-name>\n./labctl promote hello-app:latest --to prod --by <your-name>\n./labctl deploy hello-app:latest --env prod\ncurl -s http://localhost:9082/',
        ],
      },
      {
        id: '7.hand-rollback',
        kind: 'hand',
        title: 'The 3 a.m. moment',
        body:
          'The promotion service re-copies the previous successful promotion’s digest into the prod registry and records action: "rollback". The running container doesn’t reload by magic — redeploy to pick up the old bytes.',
        commands: [
          './labctl rollback hello-app --env prod',
          './labctl deploy hello-app:latest --env prod\ncurl -s http://localhost:9082/',
          './labctl promotions',
        ],
      },
      {
        id: '7.drill',
        kind: 'drill',
        title: 'The incident drill (capstone)',
        body:
          'Break + diagnose + fix + rollback as one incident timeline: break vulnerable-base (CI green!), detect via scan (FAILED), confirm containment (promotion 409s, prod still healthy), remediate (fix, rebuild, rescan, re-promote), then reconstruct the whole timeline from ./labctl promotions and ./labctl scans alone. That’s the bar.',
        commands: ['./labctl break vulnerable-base', './labctl fix vulnerable-base'],
      },
      {
        id: '7.agent',
        kind: 'agent',
        title: 'The curriculum’s thesis in one prompt',
        body:
          'You can delegate the execution of an incident response to an agent — because after seven modules, you can verify every move it makes.',
        commands: ['docker compose up -d mcp-promotion mcp-runner'],
        agentPrompt:
          'We have an incident: the current hello-app in prod is bad. Roll prod back to the previous good version, redeploy it, verify the app is healthy, and then show me the full audit trail including the rollback.',
      },
    ],
  },
  {
    num: 8,
    slug: 'byo',
    title: 'Build your own MCP tool',
    tagline: 'Stop consuming tools — author one, and watch the model find it.',
    checkMeans: 'mcp-user serves at least one tool beyond the stock set.',
    steps: [
      {
        id: '8.concept',
        kind: 'concept',
        title: 'What a tool actually is',
        body:
          'An MCP tool is a function, a JSON schema derived from its signature, and a docstring the model reads to decide when to call it. You’ve used 33 of them; now you’ll speak the wire protocol raw, then ship your own. The docstring is the prompt — that’s the craft.',
      },
      {
        id: '8.hand-wire',
        kind: 'hand',
        title: 'Speak raw MCP with curl',
        body:
          'The mcp-user server speaks JSON-RPC 2.0 over streamable HTTP (stateless mode, so each request stands alone). tools/list is the discovery call every client — including the chat-ui — makes. The response arrives as a server-sent-events frame; the data: line is the JSON-RPC reply.',
        commands: [
          "curl -s http://localhost:8003/mcp \\\n  -H 'Content-Type: application/json' \\\n  -H 'Accept: application/json, text/event-stream' \\\n  -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}'",
          "curl -s http://localhost:8003/mcp \\\n  -H 'Content-Type: application/json' \\\n  -H 'Accept: application/json, text/event-stream' \\\n  -d '{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"list_roles\",\"arguments\":{}}}'",
        ],
        expected:
          'First call: every stock tool with its inputSchema. Second: the same list_roles payload the agent sees.',
      },
      {
        id: '8.hand-author',
        kind: 'hand',
        title: 'Author your tool',
        body:
          'Open mcp-server/mcp_server/custom_tools.py — it ships with a documented, commented-out example (pipeline_health: one call that summarizes registries + recent promotions). Uncomment it, or write your own from the skeleton. Then rebuild and restart the server that serves it.',
        commands: [
          '$EDITOR mcp-server/mcp_server/custom_tools.py',
          'docker compose build mcp-user\ndocker compose up -d mcp-user',
          "curl -s http://localhost:8003/mcp \\\n  -H 'Content-Type: application/json' \\\n  -H 'Accept: application/json, text/event-stream' \\\n  -d '{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"tools/list\"}' | grep -o '\"name\":\"[a-z_]*\"'",
        ],
        expected: 'Your tool’s name appears in tools/list — the model can now discover it.',
      },
      {
        id: '8.agent',
        kind: 'agent',
        title: 'Watch the model find your tool',
        body:
          'No re-registration, no config: the chat-ui refreshes tool lists from the live servers, so your tool is simply there. Then iterate: change ONLY the docstring, rebuild, and ask an ambiguous question — watch tool selection change. The docstring is the prompt.',
        agentPrompt:
          'Give me a one-call health summary of the delivery pipeline using the pipeline_health tool, and tell me which tool you used.',
      },
    ],
  },
]

export function moduleByNum(num: number): LearnModule {
  return LEARN_MODULES.find((m) => m.num === num) ?? LEARN_MODULES[0]
}
