"""Module verifications (`labctl check <module>` / `labctl modules`).

Each check returns (passed: bool, detail: str, hint: str). The hint is only
shown on failure and always names the next command to try.
"""

from . import deploy, env, gitea, http, promotion, proc, registry
from .errors import LabError

OWNER, REPO = env.DEFAULT_OWNER, env.DEFAULT_REPO
APP = "hello-app"


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
    extra = [t for t in image_tags if t != "latest"]
    if extra:
        return (True, "dev registry has non-latest tag(s) for {}: {}".format(APP, ", ".join(sorted(extra))), "")
    return (False, "only 'latest' exists for {} in dev".format(APP),
            "module 3: ./labctl retag {}:latest v1.0.0".format(APP))


def check_security(ctx):
    scans = promotion.list_scans(ctx)
    if not scans:
        return (False, "no scans recorded yet",
                "module 4: ./labctl scan {}:latest".format(APP))
    app_scans = promotion.list_scans(ctx, image_name=APP, limit=1)
    if not app_scans:
        return (False, "no scan recorded for {}".format(APP),
                "module 4: ./labctl scan {}:latest".format(APP))
    latest = app_scans[0]
    if latest.get("passed"):
        return (True, "latest {} scan passed (critical={})".format(APP, latest.get("critical")), "")
    return (False, "latest {} scan FAILED (critical={})".format(APP, latest.get("critical")),
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
        port = env.DEPLOY_PORTS.get(envname)
        if not port:
            continue
        try:
            resp = http.request(ctx, "GET", "http://localhost:{}/health".format(port),
                                service=name, timeout=3)
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
