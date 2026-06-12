# The DevOps Curriculum — Seven Modules, By Hand First

> **DevOpsDays Austin 2026** — the deep track. The walkthrough teaches you what MCP is;
> this curriculum teaches you the **CI/CD craft underneath it** — on the same lab,
> on your own laptop, with real Git, real pipelines, real registries, real scanners.

---

## Two editions, one backend

The curriculum ships in two editions. **They share the same backend** — the same
compose services, the same Gitea, the same registries, the same promotion service.
The only difference is the cockpit you sit in.

- **CLI edition** — you drive everything with `./labctl` and a terminal. No chat-ui,
  no browser, **no LLM required**. `labctl` is stdlib-only Python (≥ 3.9): no pip
  install, no virtualenv. Start it with:

  ```bash
  ./scripts/2-setup.sh --tier=full --edition=cli     # or: make full EDITION=cli
  ./labctl status
  ```

- **GUI edition** — the chat-ui on `http://localhost:3001` plus the live
  **⛓ Pipeline Board** (the new header button next to ◇ Walkthrough). The board shows
  the whole flow — `commit → CI → registry-dev → scan → staging → prod → deployed` —
  refreshing every 4 seconds, with a live event feed. Start it with:

  ```bash
  ./scripts/2-setup.sh --tier=full                   # or: make full
  ```

Both editions want the **full tier** (~1.9 GB — see the
[tier table in the README](../README.md#disk-breakdown) and the
[pre-workshop prewarm guidance](PRE-WORKSHOP.md)). If you're already on `large`,
`make full` levels you up without teardown — tiers are strict supersets.

### The philosophy: by hand first, then by agent

Every module follows the same arc:

1. **By hand** — you type the real commands: `git`, `curl`, `docker`, `skopeo`,
   `labctl`. When `labctl` wraps something, run it with `--verbose` and it prints
   the raw equivalent (prefixed `→ raw:`) — the exact `curl`/`docker`/`skopeo`/`git`
   line it's about to run. No magic.
2. **Then by agent** — you hand the same job to an LLM through MCP tools and watch
   it orchestrate what you just did manually.

Why this order? Because you cannot supervise automation you couldn't perform
yourself. The agent is impressive *precisely because* you know what it's doing
under the hood — and when it goes sideways (it will, that's what the break-fix
drills are for), you'll be the person in the room who can diagnose it.

CLI-edition attendees can do every **By hand** and **Verify** section with zero
LLM. The **By agent** sections need the chat-ui (GUI edition) and at least one
model — see [PRE-WORKSHOP.md](PRE-WORKSHOP.md) for LLM options.

### Checking your work

Every module ends with a verification:

```bash
./labctl check <module-number>     # PASS/FAIL + a hint on failure
./labctl modules                   # list all module checks
```

The exit code is the number of failures, so `./labctl check 2 && echo ready` works
in scripts too. GUI edition: each module also tells you what to look for on the
Pipeline Board.

Lab credentials used throughout (lab-only, intentionally public):
Gitea admin **mcpadmin / mcpadmin123** at `http://localhost:3000`.

---

## Module 1: Git & collaboration

**What you're learning.** Every artifact in a real delivery pipeline traces back to
a commit — Git is the audit trail the whole industry hangs everything else on.
Branches let teams work in parallel without trampling each other; pushes to a shared
remote (here: Gitea, a self-hosted GitHub-alike) are the events that trigger
everything downstream. If you've only ever clicked "Sync" in an editor, this module
makes the underlying moves explicit.

### By hand

Clone the seeded sample app. The credentials are embedded in the URL — fine for a
lab on `localhost`, a firing offense in production (we'll keep calling this out):

```bash
git clone http://mcpadmin:mcpadmin123@localhost:3000/mcpadmin/sample-app.git
cd sample-app
git log --oneline        # the bootstrap seeded app.py + Dockerfile for you
```

`sample-app` is a tiny Python HTTP server (`app.py`, answers on container port 8080
with a `/health` endpoint) plus a `Dockerfile`. Make a change on a branch:

```bash
git checkout -b feature/my-greeting
# open app.py in your editor and change the response message, then:
git add app.py
git commit -m "Change greeting"
git push -u origin feature/my-greeting
```

Open `http://localhost:3000/mcpadmin/sample-app` in a browser, create a pull
request from `feature/my-greeting` into `main`, and merge it. (Solo shortcut:
`git checkout main && git merge feature/my-greeting && git push` does the same
without the PR ceremony — but do the PR once; reviewing diffs in a web UI is the
daily bread of collaboration.)

Survey the lab's repos from the CLI:

```bash
./labctl repos
./labctl --verbose repos     # → raw: the exact curl against the Gitea API
```

### By agent

GUI edition. The Git tools live on the **mcp-gitea** server — bring it online:

```bash
docker compose up -d mcp-gitea
```

Then paste into the chat:

> Create a branch called `feature/agent-edit` in mcpadmin/sample-app, update the
> greeting in app.py on that branch, commit it with a sensible message, and then
> show me the five most recent commits on main.

Watch the tool calls — the agent is doing exactly the clone/branch/commit dance you
just did, via the Gitea API instead of a working copy.

### Verify

```bash
./labctl check 1
```

PASS means: `sample-app` is reachable in Gitea and `main` has more than one commit.

**Pipeline Board (GUI):** open **⛓ Pipeline** — the **commit** node should be green;
click it for the last commit (author, message, sha) and a link into Gitea. Your
push also shows up in the live event feed (the bootstrap registered a Gitea webhook
into the board's event stream).

---

## Module 2: CI pipelines as code

**What you're learning.** Continuous Integration means every push is automatically
tested and built — and the pipeline itself is *code*, versioned next to the app it
builds. This is the single biggest cultural shift of the last fifteen years:
pipelines stopped being a Jenkins page someone clicks together and became a YAML
file you review like any other change. You are going to **write the workflow file
yourself**, line by line — `labctl ci init` exists as a shortcut, but not today.

The lab runs real [Gitea Actions](http://localhost:3000) (GitHub-Actions-compatible)
with a registered runner container (`act-runner`). Jobs execute inside a local
image, `mcp-lab-ci-base:latest`, built from `ci-base/` at setup — it carries
`git bash curl jq skopeo nodejs python3 py3-pytest` on top of `docker:27-cli`, and
runs on the lab network with the Docker socket mounted, so CI jobs can build and
push images.

### By hand

In your `sample-app` working copy, create the workflow file at exactly this path
(Gitea Actions discovers workflows under `.gitea/workflows/`):

```bash
mkdir -p .gitea/workflows
$EDITOR .gitea/workflows/ci.yml
```

This is the canonical content — type it (or paste it), then read the line-by-line
tour below until every line is boring to you:

```yaml
name: CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Clone
        run: |
          git clone http://mcpadmin:mcpadmin123@gitea:3000/mcpadmin/sample-app.git .
          git checkout "$GITHUB_SHA"
      - name: Test
        run: |
          if ls test_*.py >/dev/null 2>&1; then python3 -m pytest -q; else echo "no tests"; fi
      - name: Build image
        run: |
          docker build -t hello-app:"$GITHUB_SHA" -t hello-app:latest .
      - name: Push to dev registry
        run: |
          skopeo copy --dest-tls-verify=false docker-daemon:hello-app:latest docker://registry-dev:5000/hello-app:latest
          skopeo copy --dest-tls-verify=false docker-daemon:hello-app:"$GITHUB_SHA" docker://registry-dev:5000/hello-app:"$GITHUB_SHA"
      - name: Notify chat-ui
        run: |
          curl -sf -X POST http://chat-ui:3001/api/events -H 'Content-Type: application/json' \
            -d "{\"source\":\"runner\",\"type\":\"ci.success\",\"summary\":\"CI built hello-app @ ${GITHUB_SHA}\"}" || true
```

Line by line:

- **`name: CI`** — the display name in the Actions UI. Cosmetic, but you'll grep for it.
- **`on: [push]`** — the trigger. *Every* push, every branch. Real shops scope this
  (`branches: [main]`, `paths:`); we want maximum feedback in a lab.
- **`jobs: build:`** — one job named `build`. Jobs run in parallel by default;
  steps within a job run sequentially and share a workspace.
- **`runs-on: ubuntu-latest`** — a *label*, not an OS promise. The lab's runner maps
  both `ubuntu-latest` and `lab` to the `mcp-lab-ci-base:latest` container. The same
  trick is how self-hosted GitHub runners work.
- **`Clone`** — yes, manually. GitHub Actions has `actions/checkout`; our offline
  runner clones explicitly, which has teaching value: CI jobs start *empty* — code
  only exists in the job because a step fetched it. `gitea:3000` (not `localhost`)
  because the job runs inside the `mcp-lab-net` container network. `$GITHUB_SHA` is
  the exact commit that triggered the run — pipelines build *commits*, not branches,
  or you get races. The embedded credentials are the lab-only convenience again; in
  production this is an injected token, never a literal.
- **`Test`** — runs `pytest` quietly if any `test_*.py` exists, else says
  "no tests". A failing test fails the step, which fails the job, which means
  **no image is built or pushed** — the gate ordering is the whole point.
- **`Build image`** — builds the app's `Dockerfile` and tags the result twice:
  immutable (`hello-app:<sha>`) and moving (`hello-app:latest`). Module 3 is
  entirely about why you want both.
- **`Push to dev registry`** — `skopeo copy` moves the image from the job's Docker
  daemon (`docker-daemon:`) into the dev registry (`docker://registry-dev:5000/...`).
  `--dest-tls-verify=false` because lab registries speak plain HTTP. Note where it
  pushes: **dev only.** CI never writes to staging or prod — promotion does
  (module 5), and that separation is a real-world security boundary.
- **`Notify chat-ui`** — posts a one-line event to the Pipeline Board's feed. The
  trailing `|| true` means a missing chat-ui (CLI edition!) can never fail your
  build. Decorations must not gate delivery.

Commit and push it — pushing the workflow file *is itself a push*, so it triggers
the first run:

```bash
git add .gitea/workflows/ci.yml
git commit -m "Add CI pipeline"
git push
```

Watch the run from the terminal (polls the Actions API, prints status transitions
until it finishes):

```bash
./labctl runs sample-app --watch
```

Or in the browser: `http://localhost:3000/mcpadmin/sample-app/actions` — click into
the run, expand each step, read the logs. When it's green, prove the artifact
landed where the workflow said it would:

```bash
curl -s http://localhost:5001/v2/_catalog
curl -s http://localhost:5001/v2/hello-app/tags/list
```

You should see `hello-app` with `latest` plus a 40-character sha tag.

(The promised shortcut, for restoring a clean workflow later or for fast-forwarding
a stuck neighbor: `./labctl ci init` commits this exact canonical file via the
Gitea API.)

### By agent

```bash
docker compose up -d mcp-gitea mcp-registry
```

> Look at the most recent CI run on mcpadmin/sample-app. Did it pass? Summarize
> what each step did, and confirm that the hello-app image it built is now in the
> dev registry with both a latest tag and a sha tag.

The agent uses the Gitea Actions tools (`gitea_list_action_runs` /
`gitea_get_action_run`) plus the registry tools — same APIs you just curled.

### Verify

```bash
./labctl check 2
```

PASS means: the workflow file exists in the repo, the latest Actions run succeeded,
and `hello-app` is present in the dev registry.

**Pipeline Board (GUI):** the **CI** node goes blue while the run executes, then
green; click it for the run list with status chips. The **registry-dev** node's
drawer now shows `hello-app` in the dev column, and the event feed shows the
runner's `ci.success` event.

### Break-fix drill: `dockerfile-typo`

CI's job is to fail loudly *before* bad changes ship. Let's give it something to
catch:

```bash
./labctl break dockerfile-typo
```

This commits a Dockerfile whose first line is `FROM pythn:3.12-slim` — the classic
fat-fingered base image. The push triggers CI; this time:

```bash
./labctl runs sample-app --watch
```

ends in **failure**. Diagnose like you would at work — go to the logs:
`http://localhost:3000/mcpadmin/sample-app/actions`, open the failed run, expand
the **Build image** step. You'll find Docker unable to resolve `pythn` (a
pull/resolve error for a repository that doesn't exist). The Clone and Test steps
passed — the failure is *located*, which is what step-structured pipelines buy you.
Note also: `curl -s http://localhost:5001/v2/hello-app/tags/list` shows **no new
sha tag** — the broken commit never produced an artifact.

```bash
./labctl fix dockerfile-typo      # restores the canonical Dockerfile
./labctl runs sample-app --watch  # the fix-push triggers a fresh, green run
```

`./labctl scenarios` lists all three drill scenarios; every `break`/`fix` is an
idempotent commit through the Gitea API, so re-running is always safe.

---

## Module 3: Artifacts & registries

**What you're learning.** A container registry is the warehouse between "CI built
it" and "production runs it". The key mental model is **tags vs digests**: a tag
(`latest`, `v1.0.0`) is a *mutable pointer* — anyone can move it; a digest
(`sha256:…`) is the *content-addressed identity* of the image — it can never change,
only be pointed at. Mature shops promote and deploy **by digest** and use tags as
human-friendly labels. Supply-chain security (signing, SBOM, provenance) is built
on this distinction.

The lab runs three registries, one per environment:

| Registry | Host port | In-network address |
|---|---|---|
| dev | 5001 | `registry-dev:5000` |
| staging | 5003 | `registry-staging:5000` |
| prod | 5002 | `registry-prod:5000` |

### By hand

List what CI has produced so far:

```bash
./labctl images -r dev
./labctl tags hello-app -r dev
```

Now look *under* a tag. The registry HTTP API returns the manifest digest as a
header:

```bash
curl -sI -H 'Accept: application/vnd.docker.distribution.manifest.v2+json' \
  http://localhost:5001/v2/hello-app/manifests/latest | grep -i docker-content-digest
```

Run the same check on the sha tag from module 2 — **same digest**. Two tags, one
artifact. For the full picture, use `skopeo inspect` (the ci-base image carries
skopeo, so no host install needed):

```bash
docker run --rm --network mcp-lab-net mcp-lab-ci-base:latest \
  skopeo inspect --tls-verify=false docker://registry-dev:5000/hello-app:latest
```

Read the output: `Digest`, `RepoTags` (every tag in the repository), `Created`,
`Layers` (the content-addressed blobs). This is what scanners, admission
controllers, and promotion tooling actually consume.

Now cut a release tag — retagging is just re-pointing, no bytes are copied:

```bash
./labctl --verbose retag hello-app:latest v1.0.0 -r dev
```

The `→ raw:` lines show the trick: a `curl` **GET** of the manifest for `latest`,
then a `curl` **PUT** of the *identical* manifest under the name `v1.0.0`. Confirm:

```bash
./labctl tags hello-app -r dev
curl -sI -H 'Accept: application/vnd.docker.distribution.manifest.v2+json' \
  http://localhost:5001/v2/hello-app/manifests/v1.0.0 | grep -i docker-content-digest
```

`v1.0.0` and `latest` report the same digest today. Tomorrow CI moves `latest`;
`v1.0.0` stays nailed to this exact build forever. That's the immutability story:
**tags drift, digests don't** — which is why module 5's promotions and module 7's
rollbacks are recorded digest-first.

### By agent

```bash
docker compose up -d mcp-registry
```

> List every image and tag in the dev registry. Then explain which tags of
> hello-app point at the same digest, and create a new tag v1.0.1 of
> hello-app:latest in dev.

### Verify

```bash
./labctl check 3
```

PASS means: at least one non-`latest` tag exists for an image in the dev registry.

**Pipeline Board (GUI):** click the **registry-dev** node — the drawer shows the
three-column image/tag table (dev | staging | prod). Your `v1.0.0` appears in the
dev column; staging and prod are still empty. Remember this table — module 5 is
about making artifacts march across it.

---

## Module 4: Security scanning

**What you're learning.** Your image contains far more than your code — a base OS,
language runtime, system libraries — and every layer carries published
vulnerabilities (CVEs). Scanners like **Trivy** match your image's contents against
vulnerability databases and report findings by severity (CRITICAL / HIGH / MEDIUM /
LOW). The industry pattern is *scan gates*: a build that fails policy can't move
toward production. The lab runs Trivy in client/server mode — a long-lived `trivy`
server (host port **8087**) holds the vulnerability DB (cached in a volume, so it
works offline after the first pull), and lightweight clients query it.

### By hand

The trivy server belongs to the `security` compose profile — full tier starts it;
confirm (or start it):

```bash
./labctl status
docker compose --profile security up -d trivy     # if it isn't already up
```

Scan the image CI built:

```bash
./labctl --verbose scan hello-app:latest -r dev
```

The `→ raw:` line is worth reading in full — it's a sibling-container trick used
everywhere in CI land:

```bash
docker run --rm --network mcp-lab-net aquasec/trivy:latest image \
  --server http://trivy:8080 --format json --insecure registry-dev:5000/hello-app:latest
```

A throwaway trivy *client* container joins the lab network, asks the trivy *server*
to scan the image straight out of the dev registry, and emits a JSON report. Two
things `labctl scan` adds on top of the raw command: it parses the severity counts
into a summary, and — crucially — it **POSTs the scan record to the promotion
service** (`/scans`). The raw command alone is just information; the recorded scan
is what module 5's policy gate actually reads.

Read your results:

```bash
./labctl scans                 # scan history: counts, pass/fail, ids
./labctl scan-report <id>      # the full JSON report for one scan
```

How to read a CVE entry in the report: `VulnerabilityID` (e.g. `CVE-2024-…`),
`PkgName` + `InstalledVersion` (what you have), `FixedVersion` (what to upgrade to
— empty means no fix released yet), `Severity`, and a description. The lab's policy
is **pass iff `critical <= 0`** (`PROMOTION_MAX_CRITICAL=0`) — the server computes
pass/fail itself; clients can't sweet-talk it. A fresh `python:3.12-slim` base
should pass. HIGHs without fixes on a slim base are normal life; criticals are not.

### By agent

```bash
docker compose up -d mcp-runner mcp-promotion
```

> Scan hello-app:latest in the dev registry, summarize the vulnerabilities by
> severity, and tell me whether this image would pass our promotion policy —
> and what that policy is.

The agent's `scan_image` tool runs the same client-container scan, records it
(scanned_by `mcp-runner`), and can cross-check `get_promotion_policy` and
`list_scans`. If it reports the trivy server unreachable, the fix is the
`--profile security` start command above.

### Verify

```bash
./labctl check 4
```

PASS means: at least one scan is recorded, and the latest scan of `hello-app`
passed policy.

**Pipeline Board (GUI):** click the **scan** node — latest scan records with CVE
counts as severity chips (critical red, high orange, medium yellow, low gray) and
a pass/fail banner.

### Break-fix drill: `vulnerable-base`

What does a *failing* gate feel like?

```bash
./labctl break vulnerable-base
```

This switches the sample-app Dockerfile to an old, CVE-laden base image
(`python:3.8-slim` or older). The push triggers CI — and here's the uncomfortable
part: **CI goes green.** The code is fine; the tests pass; the image builds and
lands in dev. Nothing about a build step knows the base image is a museum piece.

```bash
./labctl runs sample-app --watch        # green!
./labctl scan hello-app:latest -r dev   # ...not green
```

The scan summary now shows critical findings and **FAILED**. Diagnose like an
engineer triaging a report: `./labctl scans` for the failing record's id, then
`./labctl scan-report <id>` and look at which packages carry the criticals and
what `FixedVersion` says — on an EOL base, often nothing, which *is* the lesson:
the fix is a newer base, not a patch. Try to promote anyway (module 5 preview):

```bash
./labctl promote hello-app:latest --to staging
```

Rejected — HTTP 409, with a message naming the gate, e.g.
`blocked by policy: no passing scan for hello-app:latest in dev`. The pipeline is
now *policy-enforcing*, not just informative.

```bash
./labctl fix vulnerable-base            # restores the canonical base image
./labctl runs sample-app --watch        # CI rebuilds
./labctl scan hello-app:latest -r dev   # rescan the fresh image: PASSED
```

---

## Module 5: Environments & promotion

**What you're learning.** Real software moves through environments —
**dev → staging → prod** — and the act of moving an artifact between them is called
*promotion*. Two properties make promotion trustworthy: you promote **the same
bytes** (the digest, not a rebuild — "build once, promote many"), and every
promotion is **gated and audited** (who moved what, where, when, and which policy
allowed it). The lab's promotion service enforces a three-stage flow
(`PROMOTION_FLOW=three-stage`) with a scan gate (`PROMOTION_REQUIRE_SCAN=true`).

### By hand

Start by asking the service what its rules are:

```bash
./labctl policy
```

Raw equivalent: `curl -s http://localhost:8002/policy` — you'll get the flow,
whether scans are required, the critical-CVE budget, and the legal hops:
`[["dev","staging"],["staging","prod"]]`. Test the fence before trusting the gate
— try the *illegal* hop first:

```bash
./labctl promote hello-app:latest --to prod
```

409: in a three-stage flow, dev→prod is not a legal promotion. (Try
`--verbose` to see the underlying `curl -X POST http://localhost:8002/promote …`.)
Now do it properly, with your name on it — that's the audit trail:

```bash
./labctl promote hello-app:latest --to staging --by <your-name>
./labctl promote hello-app:latest --to prod --by <your-name>
```

The first hop requires the passing scan from module 4 (the gate names what's
missing if you skipped it). Each promotion copies the manifest and blobs between
registries and records an audit row with the **digest** that moved. Inspect the
trail and the warehouses:

```bash
./labctl promotions
./labctl images -r staging
./labctl images -r prod
curl -s http://localhost:5003/v2/hello-app/tags/list   # staging, from the host
curl -s http://localhost:5002/v2/hello-app/tags/list   # prod, from the host
```

Optional but satisfying: run the module 3 digest check against all three
registries (`localhost:5001` / `5003` / `5002`) — identical digest in all three.
Same bytes, promoted, not rebuilt.

### By agent

```bash
docker compose up -d mcp-promotion mcp-registry
```

> Promote hello-app:latest from dev to staging and then from staging to prod.
> Before each hop, check the promotion policy and the latest scan. Afterwards,
> show me the audit trail of all promotions.

Watch for the agent doing the right dance: policy → scan check → promote → verify.
If you ran this module by hand first, you'll recognize every step.

### Verify

```bash
./labctl check 5
```

PASS means: `hello-app` is present in **both** staging and prod, with audit rows
to show for it.

**Pipeline Board (GUI):** the three-column table from module 3 now tells the
story — `hello-app` appears in the staging column, then the prod column. The
**staging** and **prod** nodes turn green, and the **promotions** drawer shows the
audit timeline: who promoted what, when.

### Break-fix drill: `failing-test`

The gates you just used assume CI feeds them honest artifacts. Close the loop by
breaking the *earliest* gate and watching the whole downstream starve:

```bash
./labctl break failing-test
```

This commits a `test_app.py` with a failing assertion. The push triggers CI; the
**Test** step fails (run `./labctl runs sample-app --watch`, then read the pytest
assertion error in the run logs at
`http://localhost:3000/mcpadmin/sample-app/actions`). Because Test precedes Build
and Push, **no new image reaches dev** — check
`curl -s http://localhost:5001/v2/hello-app/tags/list`: no sha tag for the broken
commit. Nothing new to scan, nothing new to promote: the broken change is
quarantined at the first gate, and staging/prod still hold the last good digest.

```bash
./labctl fix failing-test            # replaces it with a passing test file
./labctl runs sample-app --watch     # green again; a fresh image lands in dev
```

(That fresh image needs a fresh scan before it can be promoted — gates don't
grandfather.)

---

## Module 6: Deploy & operate

**What you're learning.** Deployment is where artifacts become running processes —
and where conventions earn their keep. The lab's deploy convention (shared by
`labctl` and the agent's deploy tools, so both editions produce identical
deployments) is:

- Container name: `mcp-lab-app-<env>` (env ∈ dev|staging|prod)
- Host ports: dev=**9080**, staging=**9081**, prod=**9082** → container 8080
- Labels: `mcp-lab.teardown=true`, `mcp-lab.deployed=true`, `mcp-lab.env=<env>`
- Attached to the `mcp-lab-net` network
- The image is pulled **from the registry matching the environment** — prod runs
  what's in the prod registry, full stop. That's the payoff of module 5: the only
  road into the prod registry runs through the gates.

After "it's running" comes "is it healthy?" — health endpoints and logs are the
operator's first two instruments.

### By hand

Deploy what you promoted:

```bash
./labctl --verbose deploy hello-app:latest --env prod
```

The `→ raw:` lines decompose into exactly what you'd type by hand:

```bash
docker pull localhost:5002/hello-app:latest
docker run -d --name mcp-lab-app-prod --network mcp-lab-net -p 9082:8080 \
  --label mcp-lab.teardown=true --label mcp-lab.deployed=true --label mcp-lab.env=prod \
  localhost:5002/hello-app:latest
```

Note the pull source: `localhost:5002` — the prod registry's host port. Now
operate it:

```bash
curl -s http://localhost:9082/health      # the app's health endpoint
curl -s http://localhost:9082/            # the app itself
./labctl deployments                      # what's running, where, which image
./labctl applogs prod                     # the app's logs (raw: docker logs mcp-lab-app-prod)
```

Deploy to dev or staging too if you like (`--env dev` → :9080, `--env staging` →
:9081) — the convention keeps them from colliding. When you want one gone:

```bash
./labctl undeploy staging
```

### By agent

```bash
docker compose up -d mcp-runner
```

> Deploy hello-app:latest to the prod environment, then verify it's healthy and
> show me its recent logs.

### Verify

```bash
./labctl check 6
```

PASS means: an `mcp-lab-app-*` container is running and its `/health` returns 200.

**Pipeline Board (GUI):** the **deployed** node is green; its drawer lists the
deployments with clickable `http://localhost:908x` links — click through to your
running app. The full stage flow — commit → CI → registry-dev → scan → staging →
prod → deployed — should now be green end to end. Screenshot-worthy.

---

## Module 7: Day-2 ops

**What you're learning.** "Day 2" is everything after the launch party: incidents,
rollbacks, and the audit trail that lets you reconstruct *what happened* under
pressure. The single most valuable capability in an incident is a **fast, boring
rollback** — re-pointing production to the previous known-good artifact (by digest,
naturally) while humans debug at leisure. And every action — promote *and*
rollback — must leave an audit row, because the post-incident review will ask.

### By hand

First, make sure prod has history to roll back *to*: you need at least two
successful promotions of `hello-app` into prod. You have one from module 5; ship a
second release to create it (this is modules 1–5 in two minutes — feel how the
practiced loop compresses):

```bash
cd sample-app
# bump something visible in app.py (e.g. the version/greeting), then:
git add app.py && git commit -m "v2 release" && git push
./labctl runs sample-app --watch
./labctl scan hello-app:latest -r dev
./labctl promote hello-app:latest --to staging --by <your-name>
./labctl promote hello-app:latest --to prod --by <your-name>
./labctl deploy hello-app:latest --env prod
curl -s http://localhost:9082/    # v2 is live
```

Now the 3 a.m. moment — v2 is "bad" (take our word for it), roll prod back:

```bash
./labctl rollback hello-app --env prod
```

Raw equivalent: `curl -X POST http://localhost:8002/rollback` with
`{"image_name":"hello-app","tag":"latest","environment":"prod","rolled_back_by":…}`.
The promotion service re-copies the **previous successful promotion's digest** into
the prod registry under the same tag and records an audit row with
`action: "rollback"`. The registry now holds the old bytes again — but the running
container doesn't reload by magic; redeploy to pick them up:

```bash
./labctl deploy hello-app:latest --env prod
curl -s http://localhost:9082/    # v1 again
```

Read the paper trail — promotions and rollbacks interleaved, with who/what/when:

```bash
./labctl promotions
```

### The incident drill (capstone)

Combine everything: break + diagnose + fix + rollback, as one incident timeline.
Run it like a real on-call page — narrate to yourself (or a neighbor) as you go.

1. **The bad change ships toward you:** `./labctl break vulnerable-base` — an
   EOL base image lands on main; CI builds it green (module 4 taught you why).
2. **Detection:** `./labctl scan hello-app:latest -r dev` → FAILED with criticals.
   In a mature shop this scan runs automatically; the lab makes you the automation.
3. **Containment check:** `./labctl promote hello-app:latest --to staging` → 409,
   blocked by policy. The blast radius is dev. Prod is still serving the last good
   digest — confirm: `curl -s http://localhost:9082/health`.
4. **(If prod *were* bad):** `./labctl rollback hello-app --env prod` then
   `./labctl deploy hello-app:latest --env prod` — under two minutes, by digest,
   audited. You did exactly this above; in the drill, decide whether it's needed.
5. **Remediation:** `./labctl fix vulnerable-base`, `./labctl runs sample-app
   --watch`, rescan, and promote the clean build back through staging to prod.
6. **Post-incident review:** `./labctl promotions` and `./labctl scans` — can you
   reconstruct the whole timeline from the audit rows alone? That's the bar.

### By agent

```bash
docker compose up -d mcp-promotion mcp-runner
```

> We have an incident: the current hello-app in prod is bad. Roll prod back to the
> previous good version, redeploy it, verify the app is healthy, and then show me
> the full audit trail including the rollback.

This is the curriculum's thesis in one prompt: you can delegate the *execution* of
an incident response to an agent — because after seven modules, you can verify
every move it makes.

### Verify

```bash
./labctl check 7
```

PASS means: at least one rollback audit row exists.

**Pipeline Board (GUI):** the **promotions** drawer shows the rollback in the audit
timeline, and the event feed tells the whole incident story top to bottom.

```bash
./labctl check 7 && for m in 1 2 3 4 5 6; do ./labctl check $m; done
```

All seven green? You've run a complete, gated, audited software delivery lifecycle
on your own laptop — by hand *and* by agent. See you at DevOpsDays Austin.

---

## Quick reference

| Need | Command |
|---|---|
| Lab health, both editions | `./labctl status` |
| Show raw command for anything | `./labctl --verbose <command>` |
| Machine-readable output | `./labctl --json <command>` |
| Watch a CI run | `./labctl runs sample-app --watch` |
| Seed the canonical workflow | `./labctl ci init` |
| List drill scenarios | `./labctl scenarios` |
| Break / fix a scenario | `./labctl break <scenario>` / `./labctl fix <scenario>` |
| Module checks | `./labctl check <module>` / `./labctl modules` |
| Bring the lab up/down | `./labctl up [--tier=...] [--edition=...]` / `./labctl down` / `./labctl reset` |
| Engine override (podman folks) | `./labctl --engine podman <command>` |

Ports cheat-sheet: Gitea **:3000**, chat-ui **:3001** (GUI edition), registries
dev **:5001** / staging **:5003** / prod **:5002**, promotion service **:8002**,
trivy server **:8087**, deployed apps **:9080/:9081/:9082** (dev/staging/prod).
