"""Module verifications (`labctl check <module>` / `labctl modules`).

Each check returns (passed: bool, detail: str, hint: str). The hint is only
shown on failure and always names the next command to try.
"""

import json
import re

from . import deploy, env, gitea, http, promotion, proc, registry
from .errors import LabError

OWNER, REPO = env.DEFAULT_OWNER, env.DEFAULT_REPO
APP = "hello-app"

# A CI commit-SHA tag is the 40-char hex git SHA the workflow pushes
# (registry-dev:5000/hello-app:"$GITHUB_SHA"); a human retag (v1.0.0) is not.
_SHA_TAG = re.compile(r"^[0-9a-f]{40}$")


def check_git(ctx):
    commits = gitea.list_commits(ctx, OWNER, REPO)
    if commits is None:
        return (False, "{}/{} not found in Gitea".format(OWNER, REPO),
                "run lab setup — bootstrap seeds the repo: ./labctl up")
    if len(commits) > 1:
        return (True, "{}/{} reachable with {} commits on main".format(OWNER, REPO, len(commits)), "")
    return (False, "{}/{} has only {} commit(s) on main".format(OWNER, REPO, len(commits)),
            "module 1: clone the repo, change something, commit and push (need >1 commit)")


def check_ci(ctx):
    workflow = gitea.get_contents(ctx, OWNER, REPO, ".gitea/workflows/ci.yml")
    if workflow.status != 200:
        return (False, ".gitea/workflows/ci.yml missing in {}".format(REPO),
                "module 2: write the workflow by hand, or shortcut: ./labctl ci init")
    runs = gitea.list_runs(ctx, OWNER, REPO)
    if not runs:
        return (False, "workflow present but no CI runs yet",
                "push any commit to sample-app to trigger CI, then: ./labctl runs sample-app --watch")
    latest = max(runs, key=lambda r: r.get("id", 0))
    if str(latest.get("status")) != "success":
        return (False, "latest CI run status: {}".format(latest.get("status")),
                "inspect it (./labctl runs sample-app) and fix the failure "
                "(broke it on purpose? ./labctl fix <scenario>)")
    if APP not in catalog_safe(ctx, "dev"):
        return (False, "CI green but {} missing from the dev registry".format(APP),
                "check the workflow's push step — it must skopeo-copy to registry-dev:5000")
    return (True, "workflow present, latest run success, {} in dev registry".format(APP), "")


def check_artifacts(ctx):
    image_tags = registry.tags(ctx, "dev", APP)
    # CI already pushes a commit-SHA tag (40 hex chars) on every run, so merely
    # "a non-latest tag exists" passes for free. Module 3 teaches a deliberate
    # human retag (e.g. v1.0.0), so require a tag the SHA-push step would never
    # produce: non-latest and not a 40-char hex SHA.
    human = [t for t in image_tags
             if t != "latest" and not _SHA_TAG.match(t)]
    if human:
        return (True, "dev registry has human tag(s) for {}: {}".format(APP, ", ".join(sorted(human))), "")
    return (False, "only 'latest' and CI commit-SHA tag(s) exist for {} in dev".format(APP),
            "module 3: ./labctl retag {}:latest v1.0.0".format(APP))


def check_security(ctx):
    scans = promotion.list_scans(ctx)
    if not scans:
        return (False, "no scans recorded yet",
                "module 4: ./labctl scan {}:latest".format(APP))
    # The deployable artifact is hello-app:latest — pin the verdict to that tag
    # so a stray scan of some other tag can't make this module pass falsely.
    app_scans = promotion.list_scans(ctx, image_name=APP, tag="latest", limit=1)
    if not app_scans:
        return (False, "no scan recorded for {}:latest".format(APP),
                "module 4: ./labctl scan {}:latest".format(APP))
    latest = app_scans[0]
    if latest.get("passed"):
        return (True, "latest {}:latest scan passed (critical={})".format(APP, latest.get("critical")), "")
    return (False, "latest {}:latest scan FAILED (critical={})".format(APP, latest.get("critical")),
            "fix the base image (./labctl fix vulnerable-base), let CI rebuild, then rescan")


def check_promotion(ctx):
    in_staging = APP in catalog_safe(ctx, "staging")
    in_prod = APP in catalog_safe(ctx, "prod")
    promotions = promotion.list_promotions(ctx)

    def promoted_to(target):
        return any(
            p.get("action", "promote") == "promote"
            and p.get("image_name") == APP
            and p.get("to_registry") == target
            and p.get("status") == "success"
            for p in promotions
        )

    missing = []
    if not (in_staging and promoted_to("staging")):
        missing.append("staging")
    if not (in_prod and promoted_to("prod")):
        missing.append("prod")
    if not missing:
        return (True, "{} present in staging and prod with audit rows".format(APP), "")
    return (False, "{} not fully promoted (missing: {})".format(APP, ", ".join(missing)),
            "module 5: ./labctl promote {}:latest --to staging  then  --to prod".format(APP))


def check_deploy(ctx):
    completed = proc.run_cmd(ctx, [
        ctx.cfg.engine, "ps",
        "--filter", "label=mcp-lab.deployed=true",
        "--format", "{{.Names}}",
    ])
    names = [n.strip() for n in (completed.stdout or "").splitlines()
             if n.strip().startswith("mcp-lab-app-")]
    if completed.returncode != 0 or not names:
        return (False, "no mcp-lab-app-* container running",
                "module 6: ./labctl deploy {}:latest --env dev".format(APP))
    for name in names:
        envname = name.rsplit("-", 1)[-1]
        if ctx.cfg.app_health_tpl:
            url = ctx.cfg.app_health_tpl.format(env=envname) + "/health"
        else:
            port = env.DEPLOY_PORTS.get(envname)
            if not port:
                continue
            url = "http://localhost:{}/health".format(port)
        try:
            resp = http.request(ctx, "GET", url, service=name, timeout=3)
            if resp.status == 200:
                return (True, "{} running and healthy on :{}".format(name, port), "")
        except http.ServiceDown:
            continue
    return (False, "deployed container found but /health did not return 200",
            "check the app logs: ./labctl applogs <env>")


def check_ops(ctx):
    promotions = promotion.list_promotions(ctx)
    if any(p.get("action") == "rollback" for p in promotions):
        return (True, "rollback audit row found", "")
    return (False, "no rollback recorded yet",
            "module 7: ./labctl rollback {} --env prod".format(APP))


# Module 8: the stock tools mcp-user always serves. A learner-authored tool
# is anything in tools/list beyond this set (delete_all_users is registered
# conditionally, so it's stock either way). Keep in sync with
# mcp-server/mcp_server/tools/user_tools.py.
_STOCK_USER_TOOLS = {
    "list_roles", "list_users", "get_user", "get_user_by_username",
    "create_user", "update_user", "deactivate_user", "activate_user",
    "delete_user", "delete_all_users",
}


def _jsonrpc_result(resp):
    """Parse a JSON-RPC reply that may arrive as a bare JSON body or as a
    streamable-http SSE frame (`event: message` / `data: {...}`)."""
    text = resp.body.decode("utf-8", errors="replace")
    if "text/event-stream" in resp.header("Content-Type"):
        for line in text.splitlines():
            if line.startswith("data:"):
                return json.loads(line[len("data:"):].strip()).get("result", {})
        raise LabError("no data: frame in SSE reply")
    return json.loads(text or "null").get("result", {})


def check_byo(ctx):
    # No trailing slash: FastMCP serves /mcp and 307-redirects /mcp/, and
    # urllib won't re-POST a body through a redirect.
    url = ctx.cfg.mcp_user_url.rstrip("/") + "/mcp"
    try:
        resp = http.request(
            ctx, "POST", url,
            headers={"Accept": "application/json, text/event-stream"},
            json_body={"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
            service="mcp-user",
        )
    except http.ServiceDown:
        return (False, "mcp-user is not answering at {}".format(ctx.cfg.mcp_user_url),
                "module 8 needs the user MCP server: docker compose up -d mcp-user")
    if resp.status != 200:
        return (False, "tools/list returned HTTP {}".format(resp.status),
                "restart the server and retry: docker compose up -d mcp-user")
    try:
        tools = _jsonrpc_result(resp).get("tools", [])
    except (LabError, ValueError):
        return (False, "could not parse tools/list reply from mcp-user",
                "restart the server and retry: docker compose up -d mcp-user")
    names = {t.get("name", "") for t in tools}
    custom = sorted(names - _STOCK_USER_TOOLS - {""})
    if custom:
        return (True, "learner tool(s) live on mcp-user: {}".format(", ".join(custom)), "")
    return (False, "mcp-user serves only the {} stock tools".format(len(names)),
            "module 8: write your tool in mcp-server/mcp_server/custom_tools.py, then "
            "docker compose build mcp-user && docker compose up -d mcp-user")


def catalog_safe(ctx, reg):
    try:
        return registry.catalog(ctx, reg)
    except LabError:
        return []


MODULES = [
    (1, "git", "sample-app reachable in Gitea with more than one commit on main", check_git),
    (2, "ci", "CI workflow committed, latest Actions run green, hello-app pushed to dev", check_ci),
    (3, "artifacts", "a non-latest tag exists for hello-app in the dev registry", check_artifacts),
    (4, "security", "at least one scan recorded and the latest hello-app scan passed", check_security),
    (5, "promotion", "hello-app promoted to staging AND prod with audit rows", check_promotion),
    (6, "deploy", "an mcp-lab-app-* container is running and its /health returns 200", check_deploy),
    (7, "ops", "at least one rollback recorded in the promotion audit log", check_ops),
    (8, "byo", "a learner-authored tool is served by mcp-user beyond the stock set", check_byo),
]


def resolve(selector):
    """Accept a module number ('4') or name ('security'); None → all."""
    if selector in (None, "all"):
        return MODULES
    for module in MODULES:
        if selector in (str(module[0]), module[1]):
            return [module]
    valid = ", ".join("{} ({})".format(n, name) for n, name, _, _ in MODULES)
    raise LabError("unknown module '{}' — valid: {} or 'all'".format(selector, valid))
