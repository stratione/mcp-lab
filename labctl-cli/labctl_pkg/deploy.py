"""Deployments per the canonical Deploy convention (contract §1):

- container name  mcp-lab-app-<env>
- host ports      dev 9080 / staging 9081 / prod 9082 → container 8080
- labels          mcp-lab.teardown=true, mcp-lab.deployed=true, mcp-lab.env=<env>
- network         mcp-lab-net
- image pulled from localhost:<host-port-of-that-env's-registry>
"""

from . import env, proc
from .errors import LabError


def image_ref(image, tag, envname):
    return "localhost:{}/{}:{}".format(env.REGISTRY_HOST_PORTS[envname], image, tag)


def run_argv(engine, image, tag, envname):
    name = env.APP_CONTAINER_TPL.format(env=envname)
    return [
        engine, "run", "-d",
        "--name", name,
        "--network", env.NETWORK,
        "-p", "{}:{}".format(env.DEPLOY_PORTS[envname], env.APP_CONTAINER_PORT),
        "--label", "mcp-lab.teardown=true",
        "--label", "mcp-lab.deployed=true",
        "--label", "mcp-lab.env={}".format(envname),
        image_ref(image, tag, envname),
    ]


def deploy(ctx, image, tag, envname):
    if envname not in env.ENVS:
        raise LabError("unknown environment '{}' (use dev|staging|prod)".format(envname))
    engine = ctx.cfg.engine
    ref = image_ref(image, tag, envname)
    name = env.APP_CONTAINER_TPL.format(env=envname)

    pulled = proc.run_cmd(ctx, [engine, "pull", ref])
    if pulled.returncode != 0:
        raise LabError(
            "could not pull {} — is the {} registry up and the image pushed there? "
            "see: ./labctl images -r {}  ({})".format(
                ref, envname, envname, (pulled.stderr or "").strip().splitlines()[-1:] or "no detail")
        )

    # Replace any previous deployment for this env (idempotent re-deploys).
    proc.run_cmd(ctx, [engine, "rm", "-f", name])

    started = proc.run_cmd(ctx, run_argv(engine, image, tag, envname))
    if started.returncode != 0:
        raise LabError("container start failed: {}".format((started.stderr or "").strip()[:300]))
    return name, env.DEPLOY_PORTS[envname], ref


def list_deployments(ctx):
    completed = proc.run_cmd(ctx, [
        ctx.cfg.engine, "ps",
        "--filter", "label=mcp-lab.deployed=true",
        "--format", "{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}",
    ])
    if completed.returncode != 0:
        raise LabError("'{} ps' failed — is the engine running? ({})".format(
            ctx.cfg.engine, (completed.stderr or "").strip()[:200]))
    rows = []
    for line in (completed.stdout or "").splitlines():
        if not line.strip():
            continue
        parts = (line.split("|") + ["", "", "", ""])[:4]
        name = parts[0]
        envname = name.rsplit("-", 1)[-1] if name.startswith("mcp-lab-app-") else ""
        rows.append({
            "name": name,
            "image": parts[1],
            "status": parts[2],
            "ports": parts[3],
            "env": envname,
            "url": "http://localhost:{}".format(env.DEPLOY_PORTS[envname]) if envname in env.DEPLOY_PORTS else "",
        })
    return rows


def applogs(ctx, envname, tail=100):
    name = env.APP_CONTAINER_TPL.format(env=envname)
    completed = proc.run_cmd(ctx, [ctx.cfg.engine, "logs", "--tail", str(tail), name],
                             capture=False, stream=True)
    if completed.returncode != 0:
        raise LabError("no logs for {} — nothing deployed to {}? try: ./labctl deployments".format(
            name, envname))
    return 0


def undeploy(ctx, envname):
    name = env.APP_CONTAINER_TPL.format(env=envname)
    completed = proc.run_cmd(ctx, [ctx.cfg.engine, "rm", "-f", name])
    if completed.returncode != 0:
        raise LabError("nothing deployed to {} (container {} not found)".format(envname, name))
    return name
