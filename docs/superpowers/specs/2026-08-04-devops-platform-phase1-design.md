# DevOps Fundamentals Platform — Phase 1 Design

Status: draft for review
Date: 2026-08-04
Scope: Phase 1 — DevOps interface + API only. No MCP, no LLM, no payments.

## Purpose

A paid, self-hosted training product that teaches CI/CD and DevOps fundamentals
by running the entire toolchain in local containers and driving it from a
polished web application. The learner experiences the full arc:

    commit → CI build → registry → scan → patch → promote (dev→staging→prod) → deploy → operate

This is a ground-up rebuild of the existing mcp-lab. It keeps the proven
pedagogy (by hand first, break-fix drills, verify gates, everything on
localhost) and replaces the chat-centric shell with a product-grade dashboard.
MCP/AI tooling arrives in a later phase as one module among many.

## Core Design Tenet: The Real-Artifact Principle

Nothing in the UI is mocked, simulated, or summarized-only. Every panel is
backed by the live API of a real service, and every artifact is viewable raw:

| Learner sees | Backed by |
| --- | --- |
| CI pipeline YAML | The actual `.gitea/workflows/build.yml` file in their Gitea repo |
| CI run logs | Gitea Actions API, streamed live from a real act-runner execution |
| Container images | Real Docker Registry v2 instances (dev :5001, staging :5003, prod :5002), manifests and digests fetched from the registry API |
| Vulnerability scans | Trivy server scanning the actual built images; raw JSON report and SBOM downloadable |
| Patching | Real dependency/base-image bumps committed to Gitea, rebuilt by real CI, rescanned — CVE count visibly drops |
| Promotion | Real blob copy between registries via promotion-service, gated on real scan results |
| Running apps | Real containers launched from each registry, one per environment, each on its own port the learner can open in a browser |
| Logs | `docker logs` / container stdout streamed over SSE/WebSocket |

Every lesson panel offers a "raw" toggle (rendered view ↔ raw YAML/JSON/log
text) and prints the equivalent by-hand command (`git`, `curl`, `docker`,
`skopeo`) for everything the UI does.

Accepted trade-off: image footprint grows (bloat is acceptable). Tiers remain
for constrained machines, but the default install is the full stack.

## Repository Decision

Rebuild happens inside this repo under a new `platform/` tree. Old code
(chat-ui, mcp-server, labctl) stays untouched until the new platform reaches
parity, then gets pruned. Rationale: maximum reuse (promotion-service,
ci-base, scripts, pipeline aggregation logic, curriculum content), no
cross-repo coordination, reversible.

## Architecture

    platform/
      labd/            control-plane API (FastAPI, containerized, mounts engine socket)
      web/             Next.js app — the product UI (containerized, port 3010)
      modules/
        00-core/       compose: Gitea + seeded demo-app source repo
        01-git/        lessons: clone, branch, commit, push, PR, diff
        02-ci/         + act-runner; real workflow YAML; live CI logs
        03-registry/   + registry-dev/staging/prod; digests, tags, manifests
        04-scan/       + Trivy server; CVE reports, SBOM
        05-patch/      remediation: bump base image/deps, rebuild, rescan delta
        06-promote/    + promotion-service; scan-gated dev→staging→prod
        07-deploy/     run demo-app per environment from each registry
        08-day2/       logs, restart, rollback to previous digest, env drift scan

Each module pack is self-contained:

    modules/04-scan/
      compose.yml      services this pack adds (compose `include:` merged by labd)
      manifest.yaml    id, title, deps, services, lessons list, check definitions
      lessons/*.md     lesson content (rendered by web app — single source of truth)
      checks/*.sh      verify scripts run by labd against live state

Enabling a module = labd runs `docker compose -f <pack>/compose.yml up -d`
(plus its dependency packs). Disabling = down. Modularity is physical, not
profile-simulated.

### Reused from existing repo

- `promotion-service/` — promotion policy engine (three-stage, scan-gated)
- `ci-base/` — CI runner base image
- `hello-app/` + `user-api/` — merged into one seeded **demo-app** the learner owns
- `scripts/1-preflight.sh`, `2-setup.sh`, `3-teardown.sh` — adapted
- `chat-ui/app/pipeline.py` — pipeline state aggregation logic ported into labd
- `docs/CURRICULUM.md` — content migrated into per-module `lessons/`

Not ported: chat-ui itself, LLM providers, MCP servers (later phase).

## Environments Model

Three runtime environments are real running containers of demo-app, each
pulled from its own registry:

| Env | Source registry | App port |
| --- | --- | --- |
| dev | registry-dev :5001 | :8081 |
| staging | registry-staging :5003 | :8082 |
| prod | registry-prod :5002 | :8083 |

The learner can open all three in a browser simultaneously, see version/digest
drift between them, scan each environment's running image, and roll prod back
to a previous digest. This makes "environments" tangible instead of abstract.

## labd API Surface

Lifecycle & status
- `GET  /api/status` — engine (docker/podman), install tier, health map of every service
- `GET  /api/modules` — packs with enabled/disabled state, deps, progress
- `POST /api/modules/{id}/enable` / `POST /api/modules/{id}/disable`

Pipeline (the hero data)
- `GET  /api/pipeline/state` — aggregated: latest commit, CI run + status, images/digests per registry, scan summary per image, promotion records, deployed digests per environment
- `GET  /api/events` — SSE stream: Gitea webhooks + registry/CI pollers feed the live board

Environments & operations
- `GET  /api/environments` — per env: image ref, digest, container status, port, last deploy time
- `POST /api/environments/{env}/deploy` — body: image tag/digest; UI shows the by-hand equivalent
- `POST /api/environments/{env}/rollback` — redeploy previous digest
- `GET  /api/services/{name}/logs?follow=1` — SSE log stream (lab services and env apps)

Artifacts (raw, Real-Artifact Principle)
- `GET /api/artifacts/workflow` — raw CI YAML from the Gitea repo
- `GET /api/artifacts/scan/{image_ref}` — raw Trivy JSON + SBOM
- `GET /api/artifacts/manifest/{registry}/{repo}/{tag}` — raw registry manifest

Curriculum & progress
- `GET  /api/curriculum` — module/lesson tree from manifests
- `GET  /api/lessons/{id}` — lesson content + check metadata
- `POST /api/lessons/{id}/verify` — runs the pack's check scripts, returns pass/fail with captured evidence (command output)
- `GET  /api/progress` — completion state, persisted in a local volume

labd mounts the container engine socket (like today's mcp-runner) to manage
packs, deploys, and log streams. Local-lab security posture: bind to
localhost, no external exposure; documented plainly.

## Web App

Next.js + Tailwind + shadcn/ui + Framer Motion. Views:

1. **Pipeline Board** (hero) — animated live graph of commit → CI → dev →
   scan → staging → prod → deployed. Stages light up from SSE events. Click
   any stage → drill into real artifacts (logs, YAML, manifest, scan report).
2. **Course Map** — module cards with enable toggle, dependency arrows,
   progress rings. Lesson reader: prose + copy-able commands + embedded
   Remotion explainers + Verify button showing real check output.
3. **Environments** — three side-by-side environment cards (dev/staging/prod):
   running digest, open-app link, scan summary, deploy/rollback actions,
   drift indicators between environments.
4. **Environment/System panel** — every lab container: health, ports,
   credentials, live logs.

**Remotion**: `@remotion/player` compositions embedded in lessons as animated
explainers ("what happens on git push", "how promotion copies blobs", "how a
scanner gates prod"). Same compositions render to mp4 for marketing and
course intros — one codebase, two outputs. Design pass uses the
frontend-design and remotion skills; premium visual quality is a product
requirement, not polish.

## Pedagogy Mechanics (kept from mcp-lab)

- **By hand first**: every lesson's actions shown as raw commands before/alongside UI affordances.
- **Break-fix drills**: seeded failure branches (`dockerfile-typo`, `vulnerable-base`, `failing-test`) — learner sees real CI failure logs and real scan gates rejecting promotion, then fixes.
- **Verify gates**: lesson completion requires passing checks against live state, with evidence shown.

## Explicitly Deferred

MCP servers/gateway/workbench, LLM anything, payments/licensing/multi-user
auth (single-learner local progress only), Kubernetes, cloud deploy targets.
Module pack format is designed so these arrive later as packs without core
changes.

## Milestones

1. **Pack format + lifecycle**: manifest schema, labd enable/disable real compose packs, status API. Proof: toggle module 03, three registries appear/disappear.
2. **Pipeline state + events**: aggregation ported from pipeline.py, SSE stream, webhook wiring. Proof: `git push` to Gitea → event stream shows CI run → image lands in dev registry, all visible via curl.
3. **Web shell + Pipeline Board**: live board wired to /api/pipeline/state + /api/events. Proof: push a commit, watch board animate through build → registry stages.
4. **Curriculum plumbing**: lessons/verify/progress APIs + lesson reader; modules 00–03 migrated. Proof: complete module 1 end-to-end in UI with verify passing.
5. **Real ops depth**: environments view, deploy/rollback, log streaming, scan + patch + promote modules (04–08) with break-fix drills. Proof: full arc — introduce vulnerable base, watch promotion blocked, patch, rescan, promote, deploy to prod, rollback.
6. **Design + Remotion pass**: frontend-design treatment, embedded explainer compositions, marketing renders.

## Open Questions (non-blocking)

- Payment/licensing mechanism (Phase 2+; likely license key check at setup, content is local).
- Whether labctl CLI edition returns in Phase 1.5 as a thin client of labd's API (design keeps it possible; not built now).
