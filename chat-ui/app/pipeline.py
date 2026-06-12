"""GET /api/pipeline/state aggregator — one snapshot of the whole CI/CD
story for the Pipeline Board.

Each section (commit, ci, registries, scans, promotions, deployments,
events) is fetched concurrently and degrades INDEPENDENTLY to
{"status": "offline"} when its backing service is down, slow, or not
provisioned for the current tier. The endpoint itself never 500s — a
half-broken lab is exactly when the board is most useful.

Sources:
  - commit / ci      → Gitea API (GITEA_URL + GITEA_TOKEN)
  - registries       → registry-dev / registry-staging / registry-prod /v2 API
  - scans/promotions → promotion-service REST API (passthrough)
  - deployments      → the docker socket already mounted into chat-ui,
                       filtered by label mcp-lab.deployed=true
  - events           → the local event store (events.py)
"""

import asyncio
import json
import logging
import os
from datetime import datetime, timezone

import httpx

logger = logging.getLogger(__name__)

GITEA_URL = os.environ.get("GITEA_URL", "http://gitea:3000").rstrip("/")
GITEA_TOKEN = os.environ.get("GITEA_TOKEN", "")
PROMOTION_SERVICE_URL = os.environ.get(
    "PROMOTION_SERVICE_URL", "http://promotion-service:8002"
).rstrip("/")
REGISTRY_URLS = {
    "dev": os.environ.get("DEV_REGISTRY_URL", "http://registry-dev:5000").rstrip("/"),
    "staging": os.environ.get("STAGING_REGISTRY_URL", "http://registry-staging:5000").rstrip("/"),
    "prod": os.environ.get("PROD_REGISTRY_URL", "http://registry-prod:5000").rstrip("/"),
}

# The repo every curriculum module revolves around (seeded by bootstrap).
SAMPLE_REPO = "mcpadmin/sample-app"

# Per-section budget: a dead service must not stall the whole snapshot.
SECTION_TIMEOUT = 3.0

# Cap registry image listing — the board shows a summary, not an inventory.
_MAX_REGISTRY_IMAGES = 10
_MAX_CI_RUNS = 20
_MAX_EVENTS = 30

# Docker Engine API over the mounted socket (same socket main.py's
# engine detection probes). Podman serves a Docker-compatible API on it.
_DOCKER_SOCK = "/var/run/docker.sock"
# Synthetic host for UDS requests — never resolved, just keeps URLs sane.
_DOCKER_API = "http://docker"

# Deploy convention (contract §1) — fallback when a container publishes
# no port (e.g. podman rootless edge cases).
_ENV_PORTS = {"dev": 9080, "staging": 9081, "prod": 9082}


def _scrub(text: str) -> str:
    """Never let GITEA_TOKEN (or any future secret) leak via error strings
    into the pipeline snapshot (D-007)."""
    out = str(text or "")
    if GITEA_TOKEN:
        out = out.replace(GITEA_TOKEN, "***")
    return out


def _offline(error: str = "", hint: str = "") -> dict:
    section: dict = {"status": "offline"}
    if error:
        section["error"] = _scrub(error)
    if hint:
        section["hint"] = hint
    return section


def _gitea_headers() -> dict:
    return {"Authorization": f"token {GITEA_TOKEN}"} if GITEA_TOKEN else {}


# ─── Section fetchers ───────────────────────────────────────────────────


async def _fetch_commit() -> dict:
    """Latest commit on sample-app main via the Gitea commits API."""
    async with httpx.AsyncClient(timeout=SECTION_TIMEOUT) as c:
        r = await c.get(
            f"{GITEA_URL}/api/v1/repos/{SAMPLE_REPO}/commits",
            params={"limit": 1, "sha": "main", "stat": "false"},
            headers=_gitea_headers(),
        )
        r.raise_for_status()
    commits = r.json() or []
    if not commits:
        return _offline(hint=f"no commits on {SAMPLE_REPO} main yet")
    top = commits[0]
    meta = top.get("commit") or {}
    author = (meta.get("author") or {})
    return {
        "status": "ok",
        "repo": SAMPLE_REPO,
        "sha": top.get("sha") or "",
        "message": str(meta.get("message") or "").splitlines()[0] if meta.get("message") else "",
        "author": author.get("name") or "",
        "when": author.get("date") or top.get("created") or "",
    }


async def _fetch_ci() -> dict:
    """Recent Gitea Actions runs. Older Gitea versions (or actions
    disabled) 404 this endpoint — report offline with a hint instead of
    an opaque error."""
    async with httpx.AsyncClient(timeout=SECTION_TIMEOUT) as c:
        r = await c.get(
            f"{GITEA_URL}/api/v1/repos/{SAMPLE_REPO}/actions/tasks",
            headers=_gitea_headers(),
        )
    if r.status_code == 404:
        return _offline(hint=(
            "Gitea Actions API not available — enable actions "
            "(GITEA__actions__ENABLED=true) or upgrade Gitea"
        ))
    r.raise_for_status()
    body = r.json() or {}
    runs = []
    for run in (body.get("workflow_runs") or [])[:_MAX_CI_RUNS]:
        runs.append({
            "id": run.get("id"),
            "title": run.get("display_title") or run.get("name") or "",
            "status": run.get("status") or "",
            "event": run.get("event") or "",
            "head_sha": run.get("head_sha") or "",
            "created": run.get("created_at") or "",
        })
    return {"status": "ok", "runs": runs}


async def _fetch_registry(url: str) -> dict:
    """One registry's /v2/_catalog + per-image tag lists, capped."""
    async with httpx.AsyncClient(timeout=SECTION_TIMEOUT) as c:
        cat = await c.get(f"{url}/v2/_catalog", params={"n": _MAX_REGISTRY_IMAGES})
        cat.raise_for_status()
        repos = (cat.json().get("repositories") or [])[:_MAX_REGISTRY_IMAGES]
        images = []
        for repo in repos:
            try:
                tr = await c.get(f"{url}/v2/{repo}/tags/list")
                tr.raise_for_status()
                tags = tr.json().get("tags") or []
            except Exception:
                tags = []
            images.append({"name": repo, "tags": tags})
    return {"status": "ok", "images": images}


async def _fetch_scans() -> dict:
    """promotion-service GET /scans passthrough (ScanSummary — no report)."""
    async with httpx.AsyncClient(timeout=SECTION_TIMEOUT) as c:
        r = await c.get(f"{PROMOTION_SERVICE_URL}/scans", params={"limit": 20})
        r.raise_for_status()
    return {"status": "ok", "items": r.json() or []}


async def _fetch_promotions() -> dict:
    """promotion-service GET /promotions passthrough, latest 20 (the
    service already orders newest first)."""
    async with httpx.AsyncClient(timeout=SECTION_TIMEOUT) as c:
        r = await c.get(f"{PROMOTION_SERVICE_URL}/promotions")
        r.raise_for_status()
    return {"status": "ok", "items": (r.json() or [])[:20]}


async def _fetch_deployments() -> dict:
    """Containers labeled mcp-lab.deployed=true via the Docker Engine API
    on the mounted socket — the same socket main.py's engine detection
    already probes, so no extra mounts/config needed."""
    filters = json.dumps({"label": ["mcp-lab.deployed=true"]})
    transport = httpx.AsyncHTTPTransport(uds=_DOCKER_SOCK)
    async with httpx.AsyncClient(
        transport=transport, base_url=_DOCKER_API, timeout=SECTION_TIMEOUT
    ) as c:
        r = await c.get("/containers/json", params={"all": "true", "filters": filters})
        r.raise_for_status()
    items = []
    for ctr in r.json() or []:
        labels = ctr.get("Labels") or {}
        env = labels.get("mcp-lab.env") or ""
        names = ctr.get("Names") or []
        port = None
        for p in ctr.get("Ports") or []:
            if p.get("PublicPort"):
                port = p["PublicPort"]
                break
        items.append({
            "name": (names[0].lstrip("/") if names else ""),
            "image": ctr.get("Image") or "",
            "env": env,
            "port": port if port is not None else _ENV_PORTS.get(env),
            "state": ctr.get("State") or "",
        })
    return {"status": "ok", "items": items}


async def _fetch_events(event_store) -> dict:
    return {"status": "ok", "items": await event_store.list(_MAX_EVENTS)}


# ─── Aggregator ─────────────────────────────────────────────────────────


async def _guarded(coro) -> dict:
    """Per-section isolation: any exception or overrun → offline."""
    try:
        # SECTION_TIMEOUT bounds each HTTP call; the outer wait_for is a
        # backstop so multi-request sections (registry tag walks) can't
        # stack timeouts past the board's 4s polling interval.
        return await asyncio.wait_for(coro, timeout=SECTION_TIMEOUT + 0.5)
    except Exception as e:
        return _offline(error=f"{type(e).__name__}: {e}")


async def get_pipeline_state(event_store) -> dict:
    """Build the contract-§4 snapshot. Never raises."""
    (commit, ci, reg_dev, reg_staging, reg_prod,
     scans, promotions, deployments, events) = await asyncio.gather(
        _guarded(_fetch_commit()),
        _guarded(_fetch_ci()),
        _guarded(_fetch_registry(REGISTRY_URLS["dev"])),
        _guarded(_fetch_registry(REGISTRY_URLS["staging"])),
        _guarded(_fetch_registry(REGISTRY_URLS["prod"])),
        _guarded(_fetch_scans()),
        _guarded(_fetch_promotions()),
        _guarded(_fetch_deployments()),
        _guarded(_fetch_events(event_store)),
    )
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "commit": commit,
        "ci": ci,
        "registries": {"dev": reg_dev, "staging": reg_staging, "prod": reg_prod},
        "scans": scans,
        "promotions": promotions,
        "deployments": deployments,
        "events": events,
    }
