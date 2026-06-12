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
- [x] (2026-06-12 12:01Z) Live verification on this machine (Docker 29.4.3). Full-tier bring-up clean (8 core services + act-runner + trivy all healthy; both tokens minted; cold-open invariant held — all MCP servers off). e2e baseline 11/11. Real CI: `labctl ci init` → Gitea Actions run #1 success → `hello-app` in registry-dev tagged `latest`+SHA. Scan gate: promote-without-scan refused (exit 1), Trivy scan (0 crit/0 high) → gate PASS → promote allowed. Per-env gate confirmed (staging→prod needs a staging scan, not just dev). Promote chain dev→staging→prod (audits #1–#4), digest preserved end-to-end. Deploy from prod serves `{"message":"Hello from MCP Lab!","version":"1.0.0"}` on :9082; `/api/pipeline/state` reflects commit+CI+registries. Rollback: bumped app to v1.1.0 (CI run #2 → new digest, full chain to prod), `labctl rollback` (audit #5) restored the v1.0.0 digest — redeploy served version 1.0.0 again. `labctl check 1..7` all PASS.
- [x] (2026-06-12 13:50Z) Adversarial review pass over the full curriculum diff
  (`66a4585^...HEAD`, ~10.6k lines / 94 files) via four parallel per-component
  reviewers (promotion-service, mcp-server, scripts/infra, labctl), each probing
  the live lab to confirm. Findings converged on the scan gate (the talk's
  thesis) being bypassable. All confirmed findings fixed (see Decision Log) and
  locked with regression tests. Suites after fixes: promotion 63, mcp-server 50,
  labctl 65, chat-ui 111/1skip, frontend 62 vitest — all green; `docker compose
  config -q` clean (default + full).
- [x] (2026-06-12 14:45Z) Rebuilt promotion-service + all five MCP images on the
  fixed code; restarted promotion-service (additive scans.digest migration ran,
  cleaned DB preserved). Live digest-fix verify 7/7: ge=0 reject (422); scan binds
  to dev's live digest; promote with matching digest 201; tag-swap to an unscanned
  digest → promote 409 (the exact TOCTOU the review used, now blocked); tag
  restored. Lab left at the cleaned baseline.
- [x] (2026-06-12 14:45Z) Docs truth pass: CURRICULUM module 5 now teaches per-env
  re-attestation (the staging→prod hop's required staging scan) and the digest
  binding; by-agent prompt updated to scan each hop's source registry. Contract §2
  scan-gate spec updated for digest binding, per-env re-attestation, the scans
  `digest` field + ge=0, and the 502-on-failed-copy promote status.

## Surprises & Discoveries (Living)

- **2026-06-12** First parallel build wave was interrupted by an API session
  limit. Components A and B survived to completion on disk (verified by
  syntax checks + 61 green tests); C–G left no files and were relaunched as
  background agents. Lesson: disjoint-path parallel builds recover cleanly —
  per-component verification (not trust) identifies what survived.
- **2026-06-12** Component A discovered Gitea blocks webhooks to private
  hosts by default; added `GITEA__webhook__ALLOWED_HOST_LIST=external,chat-ui`
  so the pipeline-event webhook can deliver at all.
- **2026-06-12 (live verify)** The scan gate is **per-environment**, not
  scan-once: a passing scan recorded in `dev` lets dev→staging through, but
  staging→prod is refused until a scan is recorded against the image in
  `staging`. Stronger than the plan's prose implied, and pedagogically good
  (each environment re-attests), but worth calling out in CURRICULUM module 5
  so attendees aren't surprised by the second refusal. Live run needed scans
  #1 (dev) + #2 (staging) to reach prod.
- **2026-06-12 (live verify)** Zero defects found in live end-to-end: every
  acceptance step passed first try on Docker 29.4.3. CI runs completed in ~7s
  (in-repo `mcp-lab-ci-base` image + plain `run:` steps, no checkout pull).
- **2026-06-12 (adversarial review)** The live happy-path run passed clean, but
  an adversarial sweep found the scan gate — the security control the whole talk
  is about — bypassable several independent ways the happy path can't surface:
  (1) the gate bound to the *tag*, not the manifest digest, so re-pointing a tag
  to vulnerable bytes *after* a passing scan (TOCTOU) promoted unscanned bytes to
  prod — confirmed live by pushing an unscanned digest through; (2) a Trivy
  report with no `Results` key (what Trivy emits for an image it can't analyze)
  tallied as 0 criticals → recorded `passed=true` — "not analyzed" was
  indistinguishable from "analyzed clean"; (3) a failed `/promote` returned HTTP
  201, so a caller checking only the status code saw a green promotion that never
  happened; (4) a second consecutive `rollback` was a no-op that still reported
  success (it inferred "current" from promote rows only, ignoring prior
  rollbacks); (5) `labctl check 4` read the newest hello-app scan ignoring tag,
  so a stray scan of any junk tag passed the security module; (6) teardown's
  image regex omitted staging :5003 and hardcoded `sample-app`, leaking deployed
  `hello-app` images every workshop re-run. Lesson: a passing live e2e proves the
  intended path works; it says nothing about the adversarial paths, which is
  exactly where a security-teaching lab must be sound.
- **2026-06-12 (registry constraint)** Surgically removing the review's `evil`/
  `evil2` tags from the live registries is impossible without a volume recreate:
  they alias the *same* manifest digest as `hello-app:latest` (they were created
  by re-pointing), and Registry v2 deletes by digest (taking all tags on it),
  with delete not even enabled in the lab. The fabricated promotion-service DB
  rows were removable surgically; the tags only clear on a registry-volume reset.

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

- **Scan gate binds to the manifest digest, not the tag** (review fix) → each
  scan records the digest the tag pointed at when scanned (`resolve_digest`,
  additive `scans.digest` column); the gate resolves the source tag→digest at
  promote time and requires a *passing scan of that exact digest*, then copies by
  that pinned digest. Closes the TOCTOU tag-swap. Caller-supplied severity counts
  are kept (lab scanners write them) but now bounded by digest + `ge=0`
  validation; making the service itself the scanner (full prod-grade) was judged
  out of scope for a stdlib teaching lab. (2026-06-12)
- **A Trivy report with no `Results` key is INDETERMINATE, not clean** (review
  fix) → `scan_image` refuses a verdict and records nothing, so an un-analyzable
  image can't satisfy the gate; `Results: []` (analyzed, zero findings) still
  passes. (2026-06-12)
- **Failed `/promote` returns 502, not 201** (review fix) → the audit row is
  still written, but a failed registry copy is no longer signalled as success at
  the HTTP layer. `rollback` now derives "current" from the registry's live
  digest + counts prior rollbacks, so a second rollback steps to a genuinely
  different digest or 404s instead of a false-success no-op. (2026-06-12)
- **labctl checks verify the taught invariant, not a proxy** (review fix) →
  `check 4` pins to `hello-app:latest` (the deployable artifact), `check 3`
  requires a human tag (rejects the 40-hex CI SHA tag the workflow already
  pushes), and `--verbose` scrubs the basic-auth password (`$GITEA_PASS`) like it
  already scrubbed the token (D-007). Teardown's image sweep now matches all
  three registry ports / any image name. `gitea_get_action_run` matches on `id`
  only (run_number is a colliding namespace). (2026-06-12)

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
