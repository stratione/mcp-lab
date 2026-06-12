# DevOps Curriculum: Real CI/CD Teaching Lab in Two Editions (CLI + GUI)

This is a living execution plan following the rules in `CLAUDE.md`. Sections
marked (Living) are updated as work proceeds. The authoritative interface
specification for every component is `docs/devops-curriculum-contract.md` —
read that file alongside this plan.

## Purpose / Big Picture

Evolve the MCP lab from "teach MCP" into a lab that teaches **how real DevOps
CI/CD tooling works**, with MCP/LLM as the automation layer on top. Concretely:

1. **Real CI**: Gitea Actions + an act-runner container. A student pushes a
   commit to `sample-app` and watches a real pipeline (test → build → push to
   registry-dev) run — no simulated builds.
2. **Real security gate**: a Trivy server scans images; the promotion service
   refuses to promote an image without a passing scan (0 criticals).
3. **Real environments**: dev → staging → prod registry chain with audit log
   and rollback.
4. **Two editions, one backend**: `labctl` (stdlib-only CLI with a `--verbose`
   flag that prints the raw curl/docker/skopeo equivalent of every action) for
   terminal learners; a live **Pipeline Board** in the chat-ui for visual
   learners.
5. **Break-fix drills**: `labctl break dockerfile-typo|failing-test|vulnerable-base`
   seeds realistic failures; students (or the LLM via MCP) diagnose and fix.
6. **Curriculum**: `docs/CURRICULUM.md`, 7 modules, each taught by-hand-first,
   then by-agent, verified by `labctl check <module>`.

How to observe success: `./scripts/2-setup.sh --tier=full` on a clean machine,
then `./labctl check 1` … `./labctl check 7` can all be brought to PASS by
following the curriculum; the Pipeline Board shows the same truth live.

## Progress (Living)

- [x] (2026-06-12 00:20Z) Branch `feat/devops-curriculum` created off main.
- [x] (2026-06-12 00:40Z) Interface contract written (`docs/devops-curriculum-contract.md`).
- [x] (2026-06-12 01:30Z) Component A — compose/setup/bootstrap/Makefile/ci-base. Verified: `bash -n` clean on all scripts, `docker compose config -q` clean, full tier + editions + runner-token minting + webhook registration + teardown coverage all present.
- [x] (2026-06-12 01:30Z) Component B — promotion-service v2. Verified: 61 pytest tests green; /promote (flow+scan gates), /rollback, /scans, /policy all implemented.
- [x] (2026-06-12 01:50Z) Component C — mcp-server. Verified by agent: 49 pytest green (14 pre-existing + 35 new). Gitea Actions/tag tools, dev/staging/prod routing, real Trivy scan_image, promotion v2 tool surface, deploy canon. Integrator note: teardown must clean `mcp-lab-app-*` containers by label (created outside compose).
- [x] (2026-06-12 02:00Z) Component D — chat-ui backend. Verified by agent: 110 passed, 2 skipped (integration self-skips). events store + 3 /api/events* endpoints + /api/pipeline/state aggregator + probe allowlist 5003/8087. Also fixed 2 pre-existing tests with hardcoded Mac paths. INTEGRATION FLAG: GET /api/events returns `{events:[...]}` wrapper — reconcile with frontend api.ts (E).
- [x] (2026-06-12 02:20Z) Component E — Pipeline Board frontend. Verified by agent: 62 vitest tests (51 pre-existing + 11 new), `npm run build` clean, zero new lint in own files, no new npm deps. PipelineBoard.tsx overlay + stage flow + drawer + event feed + Header ⛓ Pipeline button. RESOLVED the events-envelope flag: getEvents tolerates bare-array/{items}/{events}, cross-checked vs D's pipeline.py.
- [x] (2026-06-12 02:30Z) Component F — labctl CLI. 63 tests green. Full command surface per contract §7. Launcher restructured (see decision log).
- [x] (2026-06-12 02:05Z) Component G — docs. CURRICULUM.md (7 modules, by-hand+by-agent+break-fix), README (15 services, full tier, two editions), PRE-WORKSHOP (prewarm-full). Canonical CI YAML diff-identical to contract. Fixed pre-existing README link/tool-count errors.
- [x] (2026-06-12 02:40Z) Integration pass: 345 tests green (labctl 63 + promotion 61 + mcp-server 49 + chat-ui 110/2skip + frontend 62). `docker compose config -q` clean (default + full-profile). Frontend `npm run build` clean. Teardown cleans `mcp-lab-app-*`/CI containers by label (A anticipated C's note). Events-envelope reconciled (E tolerates {events}). Contract `cd labctl`→`labctl-cli` updated.
- [ ] Live verification on this machine: full-tier bring-up, end-to-end CI run, scan gate block + pass, promote chain, deploy, rollback, `labctl check 1..7`
- [ ] Adversarial review pass over the full diff; fix confirmed findings
- [ ] Final docs truth pass + commits

## Surprises & Discoveries (Living)

- **2026-06-12** First parallel build wave was interrupted by an API session
  limit. Components A and B survived to completion on disk (verified by
  syntax checks + 61 green tests); C–G left no files and were relaunched as
  background agents. Lesson: disjoint-path parallel builds recover cleanly —
  per-component verification (not trust) identifies what survived.
- **2026-06-12** Component A discovered Gitea blocks webhooks to private
  hosts by default; added `GITEA__webhook__ALLOWED_HOST_LIST=external,chat-ui`
  so the pipeline-event webhook can deliver at all.

## Decision Log (Living)

- **Three-stage flow + scan gate are env-gated with legacy code defaults**
  (`PROMOTION_FLOW=two-stage`, `PROMOTION_REQUIRE_SCAN=false` in code; compose
  sets `three-stage`/`true`) → existing tests and old volumes keep working;
  the lab gets the new behavior. (2026-06-12)
- **CI jobs run in an in-repo `mcp-lab-ci-base` image** (docker:27-cli + git +
  skopeo + python3/pytest, ~300 MB) instead of `catthehacker/ubuntu:act-latest`
  (~1.2 GB) → smaller pre-pull for attendees; workflows use plain `run:` steps
  (no actions/checkout), which is also more transparent pedagogically. (2026-06-12)
- **Push from CI via `skopeo copy docker-daemon:… docker://registry-dev:5000/…`**
  — reuses the proven D-014 workaround (daemon can't resolve compose DNS; a
  container on `mcp-lab-net` can), and teaches a real-world trick. (2026-06-12)
- **Fixed network name `mcp-lab-net`** (compose `name:` key) so host-side
  tooling can reference it without compose-project-name guessing. Upgrading an
  existing checkout recreates the network (containers are recreated by compose
  on next `up`, which setup already does). (2026-06-12)
- **chat-ui stays unprofiled; CLI edition just doesn't start it** — avoids
  profile surgery that would break existing users' bare `compose up -d`. (2026-06-12)
- **Scan records live in the promotion service** (new `/scans` endpoints) —
  the policy gate needs synchronous access to scan verdicts; both labctl and
  mcp-runner write to it, so CLI and MCP paths share one audit trail. (2026-06-12)
- **labctl is stdlib-only** — attendees run `./labctl` with any Python ≥3.9,
  zero pip/venv setup at the venue. (2026-06-12)
- **labctl package dir renamed `labctl/` → `labctl-cli/`** so the repo root
  can host the executable `./labctl` launcher (a file and a directory can't
  share a name). All 79 doc references use `./labctl <cmd>` (command form),
  which now resolves. `make test-labctl` → `cd labctl-cli`. Repo-root
  detection (3 dirnames up) is unaffected by the rename. (2026-06-12)

## Outcomes & Retrospective (Living)

_Will be completed at milestone completion._

## Context and Orientation

The lab today: 12 compose services (chat-ui :3001, five MCP servers :8003–8007
off-by-default behind compose profiles, user-api :8001, Gitea :3000, registries
dev :5001 / prod :5002, promotion-service :8002, one-shot bootstrap). Tiers
small/medium/large select backing services. `scripts/2-setup.sh` detects
docker/podman, writes `.env`, extracts the Gitea admin token from bootstrap
logs. The workshop's cold-open requires all MCP servers OFF at boot — that
invariant is preserved (see contract §9).

Key files: `docker-compose.yml`, `scripts/2-setup.sh`,
`scripts/_internal/{bootstrap.sh,init-gitea.sh}`, `Makefile`,
`promotion-service/app/{main.py,promote.py,models.py}`,
`mcp-server/mcp_server/tools/*.py`, `chat-ui/app/{main.py,mcp_client.py}`,
`chat-ui/web/src/`. Terms: *registry* = Docker Registry v2 HTTP API; *promotion*
= copying an image manifest+blobs between registries; *act-runner* = Gitea's
Actions runner (GitHub-Actions-compatible); *Trivy* = vulnerability scanner
with a client/server mode.

## Plan of Work

Seven components built in parallel against the contract (disjoint file
ownership: A=infra/scripts, B=promotion-service, C=mcp-server, D=chat-ui
backend, E=chat-ui frontend, F=labctl, G=docs), then an integration pass, a
live end-to-end verification on this machine (Docker 29), an adversarial
review sweep, and milestone commits on `feat/devops-curriculum`.

## Concrete Steps

From the project root:

    $ ./scripts/2-setup.sh --tier=full          # full lab incl. CI + security
    $ ./labctl status                           # CLI edition surface
    $ ./labctl ci init && ./labctl runs sample-app --watch
    $ ./labctl scan hello-app:latest
    $ ./labctl promote hello-app:latest --to staging
    $ ./labctl deploy hello-app:latest --env staging
    $ ./labctl check 2

Tests (no containers needed):

    $ make test-py test-py-mcp test-labctl
    $ cd promotion-service && python3 -m pytest -v
    $ cd chat-ui/web && npm run build

## Validation and Acceptance

- All pytest suites green (chat-ui, mcp-server, promotion-service, labctl).
- `docker compose config -q` clean; frontend `npm run build` clean.
- Live: a push to sample-app triggers a real Actions run that lands
  `hello-app:latest` in registry-dev; `labctl scan` records a verdict;
  promoting an unscanned/failing image to staging is refused with a policy
  message; after a passing scan, dev→staging→prod promotion succeeds;
  `labctl deploy --env prod` serves `{"message":"Hello from MCP Lab!"...}` on
  :9082; `labctl rollback` restores the previous digest; `labctl check 1..7`
  all PASS; `GET /api/pipeline/state` reflects each step; Pipeline Board renders.

## Idempotence and Recovery

Setup, bootstrap seeding, webhook registration, and all labctl break/fix
scenarios are idempotent (probe-before-create, update-by-sha). The branch can
be rebuilt from this plan + the contract at any point; `scripts/3-teardown.sh`
resets the lab. SQLite schema changes are additive so existing volumes survive.

## Interfaces and Dependencies

See `docs/devops-curriculum-contract.md` (v1) — service table, promotion v2
API, events/pipeline-state API, labctl command surface, CI workflow canon.
