# DevOps Curriculum Build — Interface Contract (v1)

This document is the single source of truth for the `feat/devops-curriculum` build.
Every component is implemented against THIS contract. If implementation reality
forces a deviation, the implementer updates this file in the same change.

Goal: evolve the lab from "teach MCP" into "teach real CI/CD tooling", with two
editions sharing one backend:

- **CLI edition** — `labctl` (stdlib-only Python CLI) drives the lab from a terminal.
- **GUI edition** — existing chat-ui plus a live **Pipeline Board**.

Pedagogy: every module is done **by hand first** (git/curl/docker/labctl
`--verbose` shows the raw equivalent), **then by agent** (LLM via MCP tools).

---

## 1. Services, ports, names (canonical)

| Service | Container name (compose service) | Host port | Container port | Compose profile |
|---|---|---|---|---|
| Chat UI | chat-ui | 3001 | 3001 | (none — always on; CLI edition simply doesn't start it) |
| User API | user-api | 8001 | 8001 | none |
| Gitea | gitea | 3000 | 3000 | none |
| Registry dev | registry-dev | 5001 | 5000 | none |
| **Registry staging (NEW)** | registry-staging | **5003** | 5000 | none |
| Registry prod | registry-prod | 5002 | 5000 | none |
| Promotion service | promotion-service | 8002 | 8002 | none |
| **Trivy server (NEW)** | trivy | **8087** | 8080 | `security` |
| **Gitea Actions runner (NEW)** | act-runner | — | — | `ci` |
| mcp-user/gitea/registry/promotion/runner | (unchanged) | 8003–8007 | same | user/gitea/registry/promotion/runner |
| bootstrap | bootstrap | — | — | none |

- The compose network gets an explicit fixed name: `mcp-lab-net`
  (`networks: mcp-lab-net: {driver: bridge, name: mcp-lab-net}`) so host-side
  tooling (labctl, docs) can say `--network mcp-lab-net` without project-name
  guessing.
- New volumes: `registry-staging-data`, `trivy-cache` (persists the vuln DB so
  the lab works offline after first pull), `act-runner-data`.
- Trivy server: image `aquasec/trivy:latest`, `command: ["server", "--listen", "0.0.0.0:8080"]`,
  volume `trivy-cache:/root/.cache/trivy`.
- act-runner: image `gitea/act_runner:latest`, env
  `GITEA_INSTANCE_URL=http://gitea:3000`,
  `GITEA_RUNNER_REGISTRATION_TOKEN=${RUNNER_REGISTRATION_TOKEN:-}`,
  `GITEA_RUNNER_NAME=lab-runner`,
  `GITEA_RUNNER_LABELS=ubuntu-latest:docker://mcp-lab-ci-base:latest,lab:docker://mcp-lab-ci-base:latest`,
  `CONFIG_FILE=/config.yaml`; volumes: docker socket,
  `./config/act-runner/config.yaml:/config.yaml:ro`, `act-runner-data:/data`;
  `security_opt: [label=disable]`.
- Gitea service gains env `GITEA__actions__ENABLED=true`.
- `config/act-runner/config.yaml` (new): `container.network: mcp-lab-net`,
  `container.options: "-v /var/run/docker.sock:/var/run/docker.sock"`,
  `container.force_pull: false`, `container.valid_volumes: ["/var/run/docker.sock"]`.

### CI job base image (NEW, in-repo)

`ci-base/Dockerfile` → built locally as `mcp-lab-ci-base:latest` (never pushed):
`FROM docker:27-cli` + `apk add --no-cache git bash curl jq skopeo nodejs python3 py3-pytest`.
Built by setup (full tier) and by `make prewarm-full`. Labeled `mcp-lab.teardown=true`.

### Deploy convention (canonical for deploy_tools AND labctl)

- Container name: `mcp-lab-app-<env>` (env ∈ dev|staging|prod)
- Host ports: dev=**9080**, staging=**9081**, prod=**9082** → container 8080
- Labels: `mcp-lab.teardown=true`, `mcp-lab.deployed=true`, `mcp-lab.env=<env>`
- Attached to network `mcp-lab-net`.
- If existing `deploy_tools.py` differs, it is updated to this canon (tests too).

---

## 2. Promotion service v2 (`promotion-service/`)

Registry name → URL map (env): `dev → DEV_REGISTRY_URL`, `staging → STAGING_REGISTRY_URL`
(NEW, `http://registry-staging:5000`), `prod → PROD_REGISTRY_URL`.

New env (with code defaults preserving today's behavior for existing tests):

- `PROMOTION_FLOW` = `two-stage` (code default; compose sets **`three-stage`**)
  - two-stage: promote dev→prod allowed (legacy).
  - three-stage: only dev→staging and staging→prod are legal; anything else → 409.
- `PROMOTION_REQUIRE_SCAN` = `false` (code default; compose sets **`true`**)
  - When true: promoting `image:tag` requires the most recent scan record for
    (image_name, tag, from_registry) to exist AND `passed == true`; else 409
    with a message that names the failing gate (e.g. "blocked by policy:
    no passing scan for hello-app:latest in dev").
- `PROMOTION_MAX_CRITICAL` = `0` — scan passes iff `critical <= PROMOTION_MAX_CRITICAL`.

### Endpoints

- `GET /health` — unchanged.
- `POST /promote` (extended, back-compat):
  `{image_name, tag, promoted_by, from_registry="dev", to_registry="prod"}`
  → 201 `{id, image_name, tag, from_registry, to_registry, promoted_by, status,
  digest, detail, created_at, action: "promote"}`. Flow + scan gates enforced
  per env above. Copies manifest+blobs between registries (existing mechanism,
  parameterized).
- `GET /promotions`, `GET /promotions/{id}` — unchanged shape + new fields.
- `POST /rollback` (NEW): `{image_name, tag="latest", environment, rolled_back_by}`
  (environment ∈ staging|prod) → re-copies the previous successful promotion's
  digest for that image into `<environment>` registry under the same tag and
  records an audit row with `action: "rollback"`. 404 if no prior promotion to
  roll back to.
- `POST /scans` (NEW): `{image_name, tag, registry, scanned_by, critical, high,
  medium, low, total, passed, report}` (`report` = JSON string, may be truncated
  to 200 KB) → 201 `{id, ...same fields..., created_at}`. `passed` is computed
  server-side from `critical <= PROMOTION_MAX_CRITICAL` (client value ignored).
- `GET /scans?image_name=&tag=&registry=&limit=20` (newest first, `report` omitted),
  `GET /scans/{id}` (includes `report`).
- `GET /policy` (NEW): `{flow, require_scan, max_critical, legal_promotions:
  [["dev","staging"],["staging","prod"]] or [["dev","prod"]]}`.

SQLite migration: `ALTER TABLE`-style additive init (init_db creates new columns
/ tables if missing — existing volumes must not break).

---

## 3. MCP server additions (`mcp-server/`)

- **gitea_tools**: `gitea_list_action_runs(owner, repo, username=None, password=None)`
  → Gitea Actions runs via API (`/repos/{owner}/{repo}/actions/tasks`; verify
  exact endpoint against current Gitea); `gitea_get_action_run(owner, repo, run_id, ...)`
  → status/steps/logs where the API exposes them (graceful "not supported by this
  Gitea version" string otherwise); `gitea_create_tag(owner, repo, tag_name,
  target="main", message="", ...)`.
- **registry_tools**: `registry` parameter now accepts `dev|staging|prod`
  everywhere; `list_registries()` → `["dev","staging","prod"]`; reads
  `STAGING_REGISTRY_URL`.
- **promotion_tools**: `promote_image(image_name, tag, promoted_by,
  from_registry="dev", to_registry="prod")`; new `rollback_deployment(image_name,
  environment, rolled_back_by, tag="latest")` → POST /rollback; new
  `list_scans(image_name="")` and `get_promotion_policy()` → GET /policy.
- **runner_tools `scan_image` becomes REAL**: runs the Trivy client as a sibling
  container over the mounted socket:
  `docker run --rm --network mcp-lab-net aquasec/trivy:latest image --server
  http://trivy:8080 --format json --insecure <registry-host>/<image>:<tag>`,
  parses severity counts from the JSON, POSTs the record to
  `PROMOTION_SERVICE_URL /scans` (scanned_by="mcp-runner"), and returns a
  summary string (counts + passed/failed + scan id). New env on mcp-runner:
  `STAGING_REGISTRY_HOST=registry-staging:5000`,
  `PROMOTION_SERVICE_URL=http://promotion-service:8002`,
  `TRIVY_SERVER_URL=http://trivy:8080`. If the trivy server is unreachable,
  return a clear actionable error (mention `--profile security` /
  `docker compose up -d trivy`), never a stack trace.
- **deploy_tools**: align to the Deploy convention in §1 (names/ports/labels);
  `environment` validated against dev|staging|prod; image pulled from the
  registry matching the environment.

---

## 4. Chat-UI backend additions (`chat-ui/app/`)

New env on chat-ui (compose): `GITEA_URL=http://gitea:3000`, `GITEA_TOKEN`
passthrough, `PROMOTION_SERVICE_URL=http://promotion-service:8002`,
`DEV_REGISTRY_URL=http://registry-dev:5000`,
`STAGING_REGISTRY_URL=http://registry-staging:5000`,
`PROD_REGISTRY_URL=http://registry-prod:5000`.

- `POST /api/events` — `{source, type, summary, detail?}` (source ∈
  gitea|runner|scan|promotion|deploy|manual; free-form type) → appended to a
  ring buffer persisted at `CHAT_DATA_DIR/events.json`, cap 500, each record
  stamped `{id, received_at}`. Returns 201 `{id}`.
- `POST /api/events/gitea` — accepts a raw Gitea webhook payload (push/create/
  delete), normalizes it into the same store (`source: "gitea"`,
  `type: <X-Gitea-Event header or payload-inferred>`, summary like
  `"push to mcpadmin/sample-app: <short sha> <commit msg>"`). Always 200 fast.
- `GET /api/events?limit=50` — newest first.
- `GET /api/pipeline/state` — aggregated snapshot; every section degrades to
  `{"status": "offline"}` independently (never 500s):

```json
{
  "generated_at": "...",
  "commit":      {"status": "ok", "repo": "mcpadmin/sample-app", "sha": "...", "message": "...", "author": "...", "when": "..."},
  "ci":          {"status": "ok", "runs": [{"id": 1, "title": "...", "status": "success|failure|running|waiting", "event": "push", "head_sha": "...", "created": "..."}]},
  "registries":  {"dev": {"status": "ok", "images": [{"name": "hello-app", "tags": ["latest","v1.0.0"]}]}, "staging": {...}, "prod": {...}},
  "scans":       {"status": "ok", "items": [/* GET /scans passthrough, no report */]},
  "promotions":  {"status": "ok", "items": [/* GET /promotions passthrough, latest 20 */]},
  "deployments": {"status": "ok", "items": [{"name": "mcp-lab-app-dev", "image": "...", "env": "dev", "port": 9080, "state": "running"}]},
  "events":      {"status": "ok", "items": [/* latest 30 events */]}
}
```

  - `ci` comes from the Gitea Actions API with `GITEA_TOKEN`; `deployments`
    from the docker socket (reuse the existing engine plumbing in main.py),
    filtered by label `mcp-lab.deployed=true`.
- `/api/probe` allowlist: add ports **5003** and **8087**.
- The Gitea webhook is registered by bootstrap (see §6) — chat-ui only receives.

---

## 5. Pipeline Board (chat-ui frontend, `chat-ui/web/src/`)

- New header button **"⛓ Pipeline"** opening a full-screen overlay
  (`PipelineBoard.tsx`), same visual language as existing components
  (shadcn/tailwind, dark theme). NO new npm dependencies — custom SVG/flex.
- Top: horizontal stage flow `commit → CI → registry-dev → scan → staging → prod → deployed`,
  each node colored by derived status (gray unknown/offline, blue running,
  green ok, red failed) from `GET /api/pipeline/state`, polled every 4 s
  (pause polling when overlay closed).
- Clicking a node opens a right-hand detail drawer:
  - commit → last commit + link to Gitea (`http://localhost:3000/...`)
  - CI → run list w/ status chips
  - registries → three-column image/tag table (dev | staging | prod) so a
    promotion is visible as an artifact appearing in the next column
  - scan → latest scan records; CVE counts as severity chips
    (crit red / high orange / med yellow / low gray), pass/fail banner
  - promotions → audit timeline (who promoted what when, incl. rollbacks)
  - deployed → deployments + clickable `http://localhost:908x` links
- Left column (or bottom strip): live event feed from `GET /api/events`.
- Reuse the existing typed API layer (`lib/api.ts`) + react-query patterns.

---

## 6. Setup / compose / bootstrap (`scripts/`, `Makefile`, root)

- **New tier `full`** = large + profiles `ci,security`: setup additionally
  (a) builds `mcp-lab-ci-base:latest` from `ci-base/`,
  (b) extracts a runner registration token after Gitea is healthy:
      `$COMPOSE exec -T -u git gitea gitea actions generate-runner-token`
      → write `RUNNER_REGISTRATION_TOKEN=` into `.env`,
  (c) `COMPOSE_PROFILES=ci,security $COMPOSE up -d trivy act-runner`.
  Makefile gains `full:` and `prewarm-full:` targets. Non-TTY default stays
  `large` (CI back-compat); the interactive prompt gains option 4.
- **Editions**: `2-setup.sh --edition=cli|gui` (default `gui`).
  `cli` edition starts everything for the tier EXCEPT `chat-ui` (and skips its
  build). Persist `MCP_LAB_EDITION=` in `.env`. Make: `make full EDITION=cli`
  (pass-through `--edition=$(EDITION)` when EDITION is set).
- **bootstrap.sh / init-gitea.sh additions** (idempotent, probe-gated like
  existing code): register webhook on `mcpadmin/sample-app` →
  `http://chat-ui:3001/api/events/gitea` (skip if a hook with that URL exists);
  do NOT seed `.gitea/workflows/` (module 2 has the student write it; labctl
  offers a shortcut).
- `.env.example`: add `RUNNER_REGISTRATION_TOKEN=`, `MCP_LAB_EDITION=gui`,
  update comments (tiers incl. full, new ports 5003/8087).
- README architecture table/diagram updated for the three new services (G owns
  README; A may leave a `<!-- ports table updated by docs pass -->` note).

### Canonical CI workflow (taught in module 2; also `labctl ci init`)

`.gitea/workflows/ci.yml` in `mcpadmin/sample-app` (runs on the `lab` /
`ubuntu-latest` label → `mcp-lab-ci-base` container, network `mcp-lab-net`,
docker socket mounted by runner config):

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

(Lab-only credentials in the clone URL are intentional and called out in docs.)

---

## 7. labctl (`labctl/` + root launcher `./labctl`)

- Pure **stdlib** Python ≥ 3.9 (urllib, argparse, json, subprocess, shutil).
  No pip install. Root `./labctl` is an executable launcher that adds
  `labctl/src` (or package dir) to `sys.path` and invokes the CLI.
- Global flags: `-v/--verbose` (print the raw-equivalent command for EVERY
  action: the exact `curl`/`docker`/`skopeo`/`git` line, prefixed `→ raw:`),
  `--json` (machine output), `--engine docker|podman` (default: read
  CONTAINER_ENGINE from `.env`, fallback auto-detect, fallback docker).
- Endpoints used (host-side): Gitea `http://localhost:3000` (admin
  mcpadmin/mcpadmin123, token from `.env` GITEA_TOKEN when present), registries
  `http://localhost:5001|5003|5002`, promotion `http://localhost:8002`,
  user-api `http://localhost:8001`, chat-ui events `http://localhost:3001`
  (optional, tolerate absence in CLI edition).
- Commands:
  - `labctl status` — table of every lab service: probe HTTP health endpoints +
    `engine ps` state; works in both editions.
  - `labctl up [--tier=...] [--edition=...]` / `labctl down` / `labctl reset`
    — thin wrappers over `scripts/2-setup.sh`, `compose down`, `scripts/3-teardown.sh`.
  - `labctl repos`, `labctl runs <repo> [--watch]` (poll Actions API until the
    latest run finishes; print status transitions), `labctl ci init [repo]`
    (commit the canonical workflow from §6 via the Gitea contents API).
  - `labctl images [-r dev|staging|prod]`, `labctl tags <image> [-r]`,
    `labctl retag <image>:<tag> <newtag> [-r]` (registry API manifest re-PUT).
  - `labctl scan <image>:<tag> [-r dev]` — `engine run --rm --network mcp-lab-net
    aquasec/trivy:latest image --server http://trivy:8080 --format json --insecure
    <registry-host>/<image>:<tag>`, parse severities, POST record to
    promotion-service `/scans` (scanned_by=`labctl`), print summary + pass/fail.
  - `labctl scans`, `labctl scan-report <id>`.
  - `labctl promote <image>:<tag> --to staging|prod [--by <name>]`,
    `labctl promotions`, `labctl policy`, `labctl rollback <image> --env prod|staging`.
  - `labctl deploy <image>:<tag> --env dev|staging|prod` (pull from
    `localhost:<port>` mapping of that registry, run per Deploy convention §1),
    `labctl deployments`, `labctl applogs <env>`, `labctl undeploy <env>`.
  - `labctl break <scenario>` / `labctl fix <scenario>` / `labctl scenarios`:
    - `dockerfile-typo` — commit `FROM pythn:3.12-alpine` Dockerfile to sample-app
      (CI build fails); fix restores canonical Dockerfile.
    - `failing-test` — commit `test_app.py` with a failing assertion (CI test
      step fails); fix replaces it with a passing test file.
    - `vulnerable-base` — switch Dockerfile base to an old CVE-laden image
      (`python:3.8-slim` or older) so the scan gate blocks promotion; fix restores.
    All via the Gitea contents API (update-file with sha), idempotent.
  - `labctl check <module>` / `labctl modules` — module verifications:
    1 `git` (sample-app reachable, >1 commit on main),
    2 `ci` (workflow file exists + latest run success + hello-app in dev registry),
    3 `artifacts` (a non-latest tag exists in dev),
    4 `security` (≥1 scan recorded; latest scan for hello-app passed),
    5 `promotion` (hello-app present in staging AND prod with audit rows),
    6 `deploy` (mcp-lab-app-* running + its /health returns 200),
    7 `ops` (≥1 rollback audit row).
    Each prints PASS/FAIL + a hint on failure; exit code = #failures.
- Tests in `labctl/tests/` (pytest, stdlib `http.server`-mocked endpoints +
  subprocess monkeypatching; no docker needed). Makefile target `test-labctl`:
  `cd labctl-cli && python3 -m pytest -v`.

---

## 8. Docs (`docs/`, `README.md`)

- `docs/CURRICULUM.md` — 7 modules, each: concept → by hand (exact commands)
  → by agent (an English prompt to paste into chat) → verify
  (`labctl check N` + what to look at on the Pipeline Board) → break-fix
  drill where applicable.
- README: new "Two editions" section (CLI vs GUI), updated architecture
  diagram/table (registry-staging :5003, trivy :8087, act-runner), tier table
  incl. `full`, labctl quick-start.
- `docs/PRE-WORKSHOP.md`: add full-tier prewarm guidance.

---

## 9. Invariants (do not break)

- All existing tests keep passing (`chat-ui`, `mcp-server` pytest suites).
- MCP servers stay OFF by default in every tier; cold-open behavior unchanged.
- No secrets in responses or logs (D-007); scrub credentials in any new logging.
- Small/medium/large tier footprints unchanged (new services are `full`-tier
  profiles, except registry-staging whose image is already pulled for dev/prod).
- Engine-agnostic: every new host-side command goes through the engine
  detection that already exists (or labctl's `--engine` flag).
