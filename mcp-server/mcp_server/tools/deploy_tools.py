"""deploy_app tool — pull from a registry and run a container, mapped to a
host port. Talks to the engine via /var/run/docker.sock using `podman --remote`
(works against both Podman and Docker Desktop's daemon).

Two pre-step issues this tool handles:
  - Daemon-side `pull` from a compose service name (registry-prod) doesn't
    work because the daemon's network view can't resolve compose DNS. Fix:
    use `skopeo copy` from inside the runner container (which IS on the
    lab network) to pull the image into a local OCI tarball, then
    `podman load` it via the socket.
  - Idempotency: any existing container with the same name is force-removed
    first so re-running the tool overwrites cleanly.
"""

import asyncio
import json
import os
import tempfile

from mcp.server.fastmcp import FastMCP, Context

from .. import config
from ..engine import engine_cmd


# Host port mapping per environment
ENV_PORTS = {"dev": 9080, "staging": 9081, "prod": 9082}


async def _run(*args: str, ctx: Context | None = None) -> tuple[int, bytes, bytes]:
    if ctx is not None:
        await ctx.info(f"$ {' '.join(args)}")
    proc = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    return proc.returncode, stdout, stderr


def register(mcp: FastMCP):
    @mcp.tool()
    async def deploy_app(
        image_name: str = "hello-app",
        tag: str = "latest",
        environment: str = "dev",
        ctx: Context | None = None,
    ) -> str:
        """
        Deploy an application to a specific environment.

        Pulls the image from the appropriate registry (via skopeo so compose
        DNS works) and runs it as a container on the mcp-lab-net network.

        Port mapping: dev→9080, staging→9081, prod→9082.

        DEFAULTS: when the user says "deploy the hello world app" with no
        further specifics, call this tool with NO arguments — it deploys
        "hello-app:latest" to "dev". Only ask the user for image_name / tag /
        environment if they explicitly mention something different (e.g.
        "deploy v2 to prod" → tag="v2", environment="prod").

        Args:
            image_name: Image to deploy. Defaults to "hello-app".
            tag: Image tag. Defaults to "latest".
            environment: dev / staging / prod. Defaults to "dev".

        Returns:
            JSON string with deployment status and accessible URL.
        """
        if environment not in ENV_PORTS:
            return json.dumps({
                "status": "error",
                "error": f"Invalid environment: {environment}. Must be one of: dev, staging, prod.",
            }, indent=2)

        # Use the compose-internal registry hostname so skopeo (running on
        # the lab network) can reach it.
        if environment == "prod":
            registry_host = os.environ.get("PROD_REGISTRY_HOST", "registry-prod:5000")
        else:
            registry_host = config.DEV_REGISTRY_HOST  # registry-dev:5000

        full_image_remote = f"{registry_host}/{image_name}:{tag}"
        local_tag = f"localhost/{image_name}:{tag}-{environment}"
        container_name = f"hello-app-{environment}"
        host_port = ENV_PORTS[environment]

        steps: list[str] = []

        # 1. Remove old container by the same name (idempotent)
        rc, _, _ = await _run(
            *engine_cmd("rm", "-f", container_name),
            ctx=ctx,
        )
        steps.append(f"Removed old container '{container_name}' (if any)")

        # 2. skopeo copy from registry into a local tarball, then podman load.
        #    This avoids the daemon-side DNS problem.
        with tempfile.TemporaryDirectory() as workdir:
            tarball = os.path.join(workdir, "img.tar")
            rc, _, stderr = await _run(
                "skopeo", "copy", "--src-tls-verify=false",
                f"docker://{full_image_remote}",
                f"docker-archive:{tarball}:{local_tag}",
                ctx=ctx,
            )
            if rc != 0:
                return json.dumps({
                    "status": "error",
                    "step": "skopeo_pull",
                    "error": stderr.decode(errors="replace").strip(),
                    "image": full_image_remote,
                }, indent=2)
            steps.append(f"Fetched {full_image_remote} via skopeo")

            rc, _, stderr = await _run(
                *engine_cmd("load", "-i", tarball),
                ctx=ctx,
            )
            if rc != 0:
                return json.dumps({
                    "status": "error",
                    "step": "engine_load",
                    "error": stderr.decode(errors="replace").strip(),
                }, indent=2)
            steps.append(f"Loaded image into local engine as {local_tag}")

        # 3. Run the container on the lab network with host port mapping.
        rc, stdout, stderr = await _run(
            *engine_cmd(
                "run", "-d",
                "--name", container_name,
                "--network", "mcp-lab_mcp-lab-net",
                "-p", f"{host_port}:8080",
                local_tag,
            ),
            ctx=ctx,
        )
        if rc != 0:
            return json.dumps({
                "status": "error",
                "step": "engine_run",
                "error": stderr.decode(errors="replace").strip(),
                "steps_completed": steps,
            }, indent=2)
        container_id = stdout.decode().strip()[:12]
        steps.append(f"Started container {container_id}")

        return json.dumps({
            "status": "success",
            "message": f"Deployed {image_name}:{tag} to {environment}.",
            "container": container_name,
            "app_url": f"http://localhost:{host_port}",
            "steps": steps,
        }, indent=2)
