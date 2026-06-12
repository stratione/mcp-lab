"""labctl command-line interface (argparse tree + command implementations).

Global flags (give them BEFORE the subcommand, e.g. `labctl -v images`;
they are also accepted after it):
  -v/--verbose   echo the raw curl/docker/bash equivalent of every action
  --json         machine-readable output on list/get commands
  --engine       docker|podman (default: CONTAINER_ENGINE from .env,
                 then auto-detect, then docker)
"""

import argparse
import json
import os
import sys
import time

from . import checks, deploy, env, gitea, http, proc, promotion, registry, render, scan, scenarios
from .errors import LabError


# ── helpers ──────────────────────────────────────────────────────────────────

def _scripts(ctx, name):
    return os.path.join(ctx.cfg.repo_root, "scripts", name)


def _short(value, n=40):
    value = str(value or "")
    return value if len(value) <= n else value[: n - 1] + "…"


# ── status / lifecycle ───────────────────────────────────────────────────────

def cmd_status(ctx, args):
    cfg = ctx.cfg
    probes = [
        # (name, base url, health path, optional?)
        ("gitea", cfg.gitea_url, "/api/healthz", False),
        ("user-api", cfg.user_api_url, "/health", False),
        ("promotion-service", cfg.promotion_url, "/health", False),
        ("registry-dev", cfg.registry_urls["dev"], "/v2/", False),
        ("registry-staging", cfg.registry_urls["staging"], "/v2/", False),
        ("registry-prod", cfg.registry_urls["prod"], "/v2/", False),
        ("chat-ui", cfg.chat_ui_url, "/", True),       # absent in CLI edition
        ("trivy", cfg.trivy_url, "/healthz", True),    # full tier only
    ]
    services, rows = {}, []
    for name, base, path, optional in probes:
        try:
            resp = http.request(ctx, "GET", base + path, service=name, timeout=2)
            up = resp.status < 500
        except http.ServiceDown:
            up = False
        services[name] = {"url": base, "up": up, "optional": optional}
        if up:
            shown = render.c("up", "green")
        else:
            shown = render.c("down", "red") + (" (optional)" if optional else "")
        rows.append([name, base, shown])

    containers = []
    engine_note = ""
    try:
        completed = proc.run_cmd(ctx, [cfg.engine, "ps", "--format", "{{.Names}}|{{.Status}}"])
        if completed.returncode == 0:
            for line in (completed.stdout or "").splitlines():
                if "|" in line:
                    name, _, state = line.partition("|")
                    containers.append({"name": name, "status": state})
        else:
            engine_note = "'{} ps' failed — is the engine daemon running?".format(cfg.engine)
    except LabError as exc:
        engine_note = str(exc)

    if ctx.json_mode:
        render.print_json({"services": services, "containers": containers})
        return 0
    render.print_table(["SERVICE", "ENDPOINT", "STATUS"], rows)
    print()
    if containers:
        render.print_table(["CONTAINER ({})".format(cfg.engine), "STATUS"],
                           [[c["name"], c["status"]] for c in containers])
    elif engine_note:
        render.warn(engine_note)
    else:
        print("no containers running ({} ps is empty) — start the lab: ./labctl up".format(cfg.engine))
    return 0


def cmd_up(ctx, args):
    argv = ["bash", _scripts(ctx, "2-setup.sh")]
    if args.tier:
        argv.append("--tier={}".format(args.tier))
    if args.edition:
        argv.append("--edition={}".format(args.edition))
    return proc.run_cmd(ctx, argv, capture=False, stream=True).returncode


def cmd_down(ctx, args):
    argv = [ctx.cfg.engine, "compose", "-f", os.path.join(ctx.cfg.repo_root, "docker-compose.yml")]
    for profile in ("user", "gitea", "registry", "promotion", "runner", "ci", "security"):
        argv += ["--profile", profile]
    argv += ["down", "--remove-orphans"]
    return proc.run_cmd(ctx, argv, capture=False, stream=True).returncode


def cmd_reset(ctx, args):
    return proc.run_cmd(ctx, ["bash", _scripts(ctx, "3-teardown.sh")],
                        capture=False, stream=True).returncode


# ── gitea: repos / runs / ci init ────────────────────────────────────────────

def cmd_repos(ctx, args):
    repos = gitea.list_repos(ctx)
    if ctx.json_mode:
        render.print_json(repos)
        return 0
    rows = [[r.get("full_name") or r.get("name"), _short(r.get("description"), 60)] for r in repos]
    render.print_table(["REPOSITORY", "DESCRIPTION"], rows)
    return 0


def _run_row(run):
    status = str(run.get("status", "?"))
    colored = {"success": render.c(status, "green"),
               "failure": render.c(status, "red"),
               "running": render.c(status, "blue"),
               "waiting": render.c(status, "yellow")}.get(status, status)
    return [run.get("id", "?"), colored, run.get("event", ""),
            str(run.get("head_sha", ""))[:10],
            _short(run.get("display_title") or run.get("name") or "", 44),
            run.get("created_at", "")]


def cmd_runs(ctx, args):
    owner, repo = env.split_repo(args.repo)
    if not args.watch:
        runs = gitea.list_runs(ctx, owner, repo)
        if ctx.json_mode:
            render.print_json(runs)
            return 0
        if not runs:
            print("no CI runs for {}/{} yet — push a commit to trigger one".format(owner, repo))
            return 0
        render.print_table(["RUN", "STATUS", "EVENT", "SHA", "TITLE", "CREATED"],
                           [_run_row(r) for r in sorted(runs, key=lambda r: -int(r.get("id", 0)))])
        return 0

    print("watching CI runs for {}/{} (Ctrl-C to stop)...".format(owner, repo))
    last = None
    while True:
        runs = gitea.list_runs(ctx, owner, repo)
        if runs:
            latest = max(runs, key=lambda r: int(r.get("id", 0)))
            status = str(latest.get("status", "?"))
            if (latest.get("id"), status) != last:
                print("[{}] run #{} ({} {}) status: {}".format(
                    time.strftime("%H:%M:%S"), latest.get("id"),
                    latest.get("event", "push"), str(latest.get("head_sha", ""))[:10], status))
                last = (latest.get("id"), status)
            if status in gitea.TERMINAL_RUN_STATUSES:
                print("final status: " + (render.c(status, "green") if status == "success"
                                          else render.c(status, "red")))
                return 0 if status == "success" else 1
        time.sleep(args.interval)


def cmd_ci_init(ctx, args):
    owner, repo = env.split_repo(args.repo)
    action = gitea.put_contents(ctx, owner, repo, scenarios.CI_WORKFLOW_PATH,
                                scenarios.CI_WORKFLOW, "labctl ci init: canonical CI workflow")
    print("{} in {}/{}: {}".format(scenarios.CI_WORKFLOW_PATH, owner, repo, action))
    if action != "unchanged":
        print("the commit itself triggers a run — watch it: ./labctl runs {} --watch".format(repo))
    return 0


# ── registries ───────────────────────────────────────────────────────────────

def cmd_images(ctx, args):
    images = registry.catalog(ctx, args.registry)
    if ctx.json_mode:
        render.print_json({"registry": args.registry, "repositories": images})
        return 0
    if not images:
        print("the {} registry is empty".format(args.registry))
        return 0
    render.print_table(["IMAGE ({} registry)".format(args.registry)], [[i] for i in images])
    return 0


def cmd_tags(ctx, args):
    image_tags = registry.tags(ctx, args.registry, args.image)
    if ctx.json_mode:
        render.print_json({"registry": args.registry, "name": args.image, "tags": image_tags})
        return 0
    render.print_table(["TAG ({} / {})".format(args.registry, args.image)],
                       [[t] for t in sorted(image_tags)])
    return 0


def cmd_retag(ctx, args):
    image, tag = env.parse_image_ref(args.image)
    digest = registry.retag(ctx, args.registry, image, tag, args.newtag)
    print("retagged {}:{} → {}:{} in the {} registry{}".format(
        image, tag, image, args.newtag, args.registry,
        " (digest {})".format(_short(digest, 24)) if digest else ""))
    return 0


# ── scanning ─────────────────────────────────────────────────────────────────

def cmd_scan(ctx, args):
    image, tag = env.parse_image_ref(args.image)
    counts, total, record = scan.run_scan(ctx, image, tag, args.registry)
    passed = bool(record.get("passed"))
    if ctx.json_mode:
        render.print_json(record)
        return 0 if passed else 1
    render.print_table(
        ["IMAGE", "REGISTRY", "CRITICAL", "HIGH", "MEDIUM", "LOW", "TOTAL"],
        [["{}:{}".format(image, tag), args.registry,
          render.c(counts["CRITICAL"], "red" if counts["CRITICAL"] else "green"),
          counts["HIGH"], counts["MEDIUM"], counts["LOW"], total]])
    print("scan #{} recorded — gate: {}".format(record.get("id"), render.pass_fail(passed)))
    if not passed:
        print("hint: promotion is blocked while critical > 0 — try: ./labctl fix vulnerable-base")
    return 0 if passed else 1


def cmd_scans(ctx, args):
    items = promotion.list_scans(ctx, limit=args.limit)
    if ctx.json_mode:
        render.print_json(items)
        return 0
    if not items:
        print("no scans recorded yet — try: ./labctl scan hello-app:latest")
        return 0
    rows = [[s.get("id"), "{}:{}".format(s.get("image_name"), s.get("tag")),
             s.get("registry"), s.get("critical"), s.get("high"), s.get("medium"),
             s.get("low"), render.pass_fail(bool(s.get("passed"))),
             s.get("scanned_by"), s.get("created_at", "")] for s in items]
    render.print_table(["ID", "IMAGE", "REG", "CRIT", "HIGH", "MED", "LOW", "GATE", "BY", "AT"], rows)
    return 0


def cmd_scan_report(ctx, args):
    record = promotion.get_scan(ctx, args.id)
    if ctx.json_mode:
        render.print_json(record)
        return 0
    meta = {k: v for k, v in record.items() if k != "report"}
    render.print_table(["FIELD", "VALUE"], sorted(meta.items()))
    report = record.get("report") or ""
    try:
        print(json.dumps(json.loads(report), indent=2))
    except ValueError:
        print(report)
    return 0


# ── promotion / rollback / policy ────────────────────────────────────────────

def _derive_from_registry(ctx, to):
    policy = promotion.get_policy(ctx)
    sources = [pair[0] for pair in (policy.get("legal_promotions") or []) if pair[1] == to]
    if not sources:
        raise LabError("no legal promotion path to '{}' under flow '{}' — see: ./labctl policy".format(
            to, policy.get("flow")))
    return sources[0]


def cmd_promote(ctx, args):
    image, tag = env.parse_image_ref(args.image)
    from_registry = args.from_registry or _derive_from_registry(ctx, args.to)
    resp = promotion.promote(ctx, image, tag, from_registry, args.to, args.by)
    if resp.status == 201:
        data = resp.json()
        if ctx.json_mode:
            render.print_json(data)
            return 0
        print("promoted {}:{}  {} → {}  (audit #{}{})".format(
            image, tag, from_registry, args.to, data.get("id"),
            ", digest " + _short(data.get("digest"), 22) if data.get("digest") else ""))
        return 0
    if resp.status == 409:
        render.err(resp.detail())
        print("policy gate refused this promotion — inspect it: ./labctl policy / ./labctl scans",
              file=sys.stderr)
        return 1
    raise LabError("promote failed (HTTP {}): {}".format(resp.status, resp.detail()))


def cmd_promotions(ctx, args):
    items = promotion.list_promotions(ctx)
    if ctx.json_mode:
        render.print_json(items)
        return 0
    if not items:
        print("no promotions yet — try: ./labctl promote hello-app:latest --to staging")
        return 0
    rows = [[p.get("id"), p.get("action", "promote"),
             "{}:{}".format(p.get("image_name"), p.get("tag")),
             "{} → {}".format(p.get("from_registry") or "-", p.get("to_registry")),
             p.get("promoted_by"), p.get("status"), p.get("created_at", "")] for p in items]
    render.print_table(["ID", "ACTION", "IMAGE", "FLOW", "BY", "STATUS", "AT"], rows)
    return 0


def cmd_policy(ctx, args):
    policy = promotion.get_policy(ctx)
    if ctx.json_mode:
        render.print_json(policy)
        return 0
    legal = " , ".join("{} → {}".format(a, b) for a, b in policy.get("legal_promotions") or [])
    render.print_table(["POLICY", "VALUE"], [
        ["flow", policy.get("flow")],
        ["require_scan", policy.get("require_scan")],
        ["max_critical", policy.get("max_critical")],
        ["legal promotions", legal],
    ])
    return 0


def cmd_rollback(ctx, args):
    image, tag = env.parse_image_ref(args.image)
    resp = promotion.rollback(ctx, image, tag, args.env, args.by)
    if resp.status == 201:
        data = resp.json()
        if ctx.json_mode:
            render.print_json(data)
            return 0
        print("rolled back {}:{} in {} to the previous promoted digest (audit #{})".format(
            image, tag, args.env, data.get("id")))
        return 0
    if resp.status == 404:
        render.err(resp.detail())
        print("nothing to roll back to — promote at least twice first (./labctl promotions)",
              file=sys.stderr)
        return 1
    raise LabError("rollback failed (HTTP {}): {}".format(resp.status, resp.detail()))


# ── deploy ───────────────────────────────────────────────────────────────────

def cmd_deploy(ctx, args):
    image, tag = env.parse_image_ref(args.image)
    name, port, ref = deploy.deploy(ctx, image, tag, args.env)
    print("deployed {} as {} → http://localhost:{}/health".format(ref, name, port))
    return 0


def cmd_deployments(ctx, args):
    rows = deploy.list_deployments(ctx)
    if ctx.json_mode:
        render.print_json(rows)
        return 0
    if not rows:
        print("nothing deployed — try: ./labctl deploy hello-app:latest --env dev")
        return 0
    render.print_table(["NAME", "ENV", "IMAGE", "STATUS", "URL"],
                       [[r["name"], r["env"], r["image"], r["status"], r["url"]] for r in rows])
    return 0


def cmd_applogs(ctx, args):
    return deploy.applogs(ctx, args.env)


def cmd_undeploy(ctx, args):
    name = deploy.undeploy(ctx, args.env)
    print("removed {}".format(name))
    return 0


# ── break / fix / scenarios ──────────────────────────────────────────────────

def _cmd_break_fix(mode):
    def runner(ctx, args):
        results = scenarios.apply(ctx, args.scenario, mode)
        for path, action in results:
            print("{}: {}".format(path, action))
        if mode == "break":
            print("now watch it fail: ./labctl runs sample-app --watch   "
                  "(undo: ./labctl fix {})".format(args.scenario))
        else:
            print("now watch it recover: ./labctl runs sample-app --watch")
        return 0
    return runner


def cmd_scenarios(ctx, args):
    if ctx.json_mode:
        render.print_json({name: spec["description"] for name, spec in scenarios.SCENARIOS.items()})
        return 0
    render.print_table(["SCENARIO", "WHAT BREAKS"],
                       [[name, spec["description"]] for name, spec in scenarios.SCENARIOS.items()])
    print("\nusage: ./labctl break <scenario>   /   ./labctl fix <scenario>")
    return 0


# ── check / modules ──────────────────────────────────────────────────────────

def cmd_modules(ctx, args):
    if ctx.json_mode:
        render.print_json([{"module": n, "name": name, "verifies": desc}
                           for n, name, desc, _ in checks.MODULES])
        return 0
    render.print_table(["#", "MODULE", "VERIFIES"],
                       [[n, name, desc] for n, name, desc, _ in checks.MODULES])
    print("\nrun one: ./labctl check <number|name>   or all: ./labctl check all")
    return 0


def cmd_check(ctx, args):
    selected = checks.resolve(args.module)
    failures = 0
    results = []
    for number, name, _desc, fn in selected:
        try:
            passed, detail, hint = fn(ctx)
        except http.ServiceDown as exc:
            passed, detail, hint = False, "service unreachable", str(exc)
        except LabError as exc:
            passed, detail, hint = False, str(exc), "see: ./labctl status"
        results.append({"module": number, "name": name, "passed": passed,
                        "detail": detail, "hint": hint})
        if not passed:
            failures += 1
        if not ctx.json_mode:
            print("[{}] module {} ({}) — {}".format(render.pass_fail(passed), number, name, detail))
            if not passed and hint:
                print("       hint: {}".format(hint))
    if ctx.json_mode:
        render.print_json(results)
    return failures


# ── parser ───────────────────────────────────────────────────────────────────

def _global_flags():
    p = argparse.ArgumentParser(add_help=False)
    p.add_argument("-v", "--verbose", action="store_true", default=argparse.SUPPRESS,
                   help="echo the raw curl/docker equivalent of every action")
    p.add_argument("--json", action="store_true", default=argparse.SUPPRESS,
                   help="machine-readable JSON output (list/get commands)")
    p.add_argument("--engine", choices=["docker", "podman"], default=argparse.SUPPRESS,
                   help="container engine (default: CONTAINER_ENGINE from .env, else auto-detect)")
    return p


def build_parser():
    common = _global_flags()
    parser = argparse.ArgumentParser(
        prog="labctl", parents=[common],
        description="Drive the MCP DevOps lab from a terminal. "
                    "Use -v to see the raw command behind every action.")
    sub = parser.add_subparsers(dest="command", metavar="<command>")
    sub.required = True

    def add(name, fn, help_text, **kwargs):
        p = sub.add_parser(name, parents=[common], help=help_text, description=help_text, **kwargs)
        p.set_defaults(func=fn)
        return p

    add("status", cmd_status, "probe every lab service + engine ps")

    p = add("up", cmd_up, "start the lab (wraps scripts/2-setup.sh)")
    p.add_argument("--tier", choices=["small", "medium", "large", "full"])
    p.add_argument("--edition", choices=["cli", "gui"])
    add("down", cmd_down, "stop the lab (compose down, all profiles)")
    add("reset", cmd_reset, "full teardown (wraps scripts/3-teardown.sh)")

    add("repos", cmd_repos, "list Gitea repositories")
    p = add("runs", cmd_runs, "show CI runs for a repo (Gitea Actions)")
    p.add_argument("repo", nargs="?", default=env.DEFAULT_REPO, help="[owner/]repo (default sample-app)")
    p.add_argument("--watch", action="store_true", help="poll until the latest run finishes")
    p.add_argument("--interval", type=float, default=3.0, help="poll interval in seconds")
    p = add("ci", None, "CI helpers")
    ci_sub = p.add_subparsers(dest="ci_command", metavar="<subcommand>")
    ci_sub.required = True
    p2 = ci_sub.add_parser("init", parents=[common],
                           help="commit the canonical CI workflow via the Gitea contents API")
    p2.add_argument("repo", nargs="?", default=env.DEFAULT_REPO)
    p2.set_defaults(func=cmd_ci_init)

    p = add("images", cmd_images, "list images in a registry")
    p.add_argument("-r", "--registry", choices=list(env.REGISTRY_NAMES), default="dev")
    p = add("tags", cmd_tags, "list tags for an image")
    p.add_argument("image")
    p.add_argument("-r", "--registry", choices=list(env.REGISTRY_NAMES), default="dev")
    p = add("retag", cmd_retag, "add a tag to an existing image (manifest re-PUT)")
    p.add_argument("image", help="image:tag")
    p.add_argument("newtag")
    p.add_argument("-r", "--registry", choices=list(env.REGISTRY_NAMES), default="dev")

    p = add("scan", cmd_scan, "trivy-scan an image and record the result")
    p.add_argument("image", help="image:tag")
    p.add_argument("-r", "--registry", choices=list(env.REGISTRY_NAMES), default="dev")
    p = add("scans", cmd_scans, "list recorded scans")
    p.add_argument("--limit", type=int, default=20)
    p = add("scan-report", cmd_scan_report, "show one scan incl. full trivy report")
    p.add_argument("id", type=int)

    p = add("promote", cmd_promote, "promote an image to the next environment")
    p.add_argument("image", help="image:tag")
    p.add_argument("--to", required=True, choices=["staging", "prod"])
    p.add_argument("--by", default="labctl", help="who promotes (audit field)")
    p.add_argument("--from", dest="from_registry", choices=list(env.REGISTRY_NAMES),
                   help="source registry (default: derived from policy)")
    add("promotions", cmd_promotions, "promotion / rollback audit log")
    add("policy", cmd_policy, "show the promotion policy gates")
    p = add("rollback", cmd_rollback, "roll an environment back to the previous digest")
    p.add_argument("image", help="image[:tag] (tag defaults to latest)")
    p.add_argument("--env", required=True, choices=["staging", "prod"])
    p.add_argument("--by", default="labctl")

    p = add("deploy", cmd_deploy, "pull from that env's registry and run the app container")
    p.add_argument("image", help="image:tag")
    p.add_argument("--env", required=True, choices=list(env.ENVS))
    add("deployments", cmd_deployments, "list deployed lab app containers")
    p = add("applogs", cmd_applogs, "tail logs of a deployed app")
    p.add_argument("env", choices=list(env.ENVS))
    p = add("undeploy", cmd_undeploy, "remove a deployed app container")
    p.add_argument("env", choices=list(env.ENVS))

    p = add("break", _cmd_break_fix("break"), "commit a teaching failure to sample-app")
    p.add_argument("scenario", choices=sorted(scenarios.SCENARIOS))
    p = add("fix", _cmd_break_fix("fix"), "restore the canonical content for a scenario")
    p.add_argument("scenario", choices=sorted(scenarios.SCENARIOS))
    add("scenarios", cmd_scenarios, "list break/fix scenarios")

    p = add("check", cmd_check, "verify a curriculum module (exit code = #failures)")
    p.add_argument("module", nargs="?", default="all", help="module number, name, or 'all'")
    add("modules", cmd_modules, "list the 7 curriculum modules")

    return parser


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        cfg = env.Config(engine_override=getattr(args, "engine", None))
        ctx = env.Context(cfg,
                          verbose=getattr(args, "verbose", False),
                          json_mode=getattr(args, "json", False))
        return int(args.func(ctx, args) or 0)
    except LabError as exc:  # includes ServiceDown — friendly, no traceback
        render.err(exc)
        return 1
    except KeyboardInterrupt:
        print(file=sys.stderr)
        return 130


if __name__ == "__main__":
    sys.exit(main())
