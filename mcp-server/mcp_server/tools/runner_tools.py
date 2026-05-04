"""mcp-runner tool implementations.

Build/scan/deploy implemented against an engine socket mounted at
/var/run/docker.sock.

Build pipeline (per plan D-014):
  1. `git clone` the repo via subprocess
  2. `podman --remote --url unix:///var/run/docker.sock build -t TAG .`
     — talks to the engine socket; no daemon-side push side-effects
  3. `podman --remote ... save -o /tmp/img.tar TAG` to an OCI tarball
  4. `skopeo copy --dest-tls-verify=false docker-archive:/tmp/img.tar
     docker://registry-dev:5000/IMAGE:TAG`
     — push happens FROM the runner container, which IS on the
     mcp-lab-net network and CAN resolve `registry-dev`. The daemon
     is NOT involved in the push, so it doesn't need lab-network DNS.

Workshop notes:
  - The runner container needs `podman` and `skopeo` (Debian apt packages)
  - The runner needs `--security-opt label=disable` to bypass rootless
    Podman's SELinux denial of /var/run/docker.sock access
  - Docker Desktop users get the same code path; `--security-opt label=disable`
    is a no-op there.
"""

import asyncio
import json
import os
import shutil
import tempfile
import urllib.parse

from mcp.server.fastmcp import FastMCP, Context

from .. import config
from ..engine import engine_cmd


async def _run(
    *args: str,
    cwd: str | None = None,
    env: dict | None = None,
    ctx: Context | None = None,
    log_args: tuple[str, ...] | None = None,
) -> tuple[int, bytes, bytes]:
    """Run a subprocess, optionally logging via the FastMCP context.

    log_args: when supplied, logged in place of args (used to scrub embedded
    HTTP-Basic credentials from the clone URL before they reach ctx.info).
    """
    if ctx is not None:
        await ctx.info(f"$ {' '.join(log_args if log_args is not None else args)}")
    proc = await asyncio.create_subprocess_exec(
        *args,
        cwd=cwd,
        env=env,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    return proc.returncode, stdout, stderr


def _inject_clone_credentials(
    repo_url: str,
    username: str | None,
    password: str | None,
) -> str:
    """Embed HTTP Basic credentials into a git clone URL.

    Resolution order:
      1. URL already has credentials → leave alone (caller knows what they want)
      2. username AND password both supplied → use those (per-call auth, the
         "MCP acts on your behalf" path)
      3. Fall back to GITEA_TOKEN as the basic-auth password (Gitea PATs work
         in that slot) so default no-args calls keep working
      4. Otherwise return repo_url unchanged

    Only http and https schemes get credentials — git+ssh and git:// don't
    use HTTP Basic.
    """
    parsed = urllib.parse.urlparse(repo_url)
    if parsed.scheme not in ("http", "https"):
        return repo_url
    if parsed.username:
        return repo_url

    if username and password:
        user, pw = username, password
    elif config.GITEA_TOKEN:
        user, pw = "mcpadmin", config.GITEA_TOKEN
    else:
        return repo_url

    encoded_user = urllib.parse.quote(user, safe="")
    encoded_pw = urllib.parse.quote(pw, safe="")
    netloc = f"{encoded_user}:{encoded_pw}@{parsed.hostname}"
    if parsed.port:
        netloc += f":{parsed.port}"
    return urllib.parse.urlunparse(parsed._replace(netloc=netloc))


def register(mcp: FastMCP):
    @mcp.tool()
    async def build_image(
        repo_url: str = "http://gitea:3000/mcpadmin/sample-app",
        image_name: str = "hello-app",
        tag: str = "latest",
        username: str | None = None,
        password: str | None = None,
        ctx: Context | None = None,
    ) -> str:
        """
        Clone a git repository, build a container image from its Dockerfile,
        and push it to the dev registry.

        DEFAULTS: when the user mentions "the hello world app" (or just "the app",
        or "the demo app") with no other details, call this tool with NO arguments
        — it will build the lab's pre-seeded sample-app repo from gitea
        (http://gitea:3000/mcpadmin/sample-app) as image "hello-app:latest". Don't
        prompt for repo_url / image_name / tag in that case; the defaults are correct.

        Auth: if the user identifies themselves (e.g. "as diana, password secret"),
        pass both username and password — they'll be embedded in the clone URL via
        HTTP Basic and the clone will be attributed to that user. If neither is
        given, the lab's GITEA_TOKEN is used as the basic-auth password so the
        clone still authenticates non-interactively.

        Args:
            repo_url: Git repo URL to clone. Defaults to the lab's sample-app.
            image_name: Image name (without registry prefix). Defaults to "hello-app".
            tag: Image tag. Defaults to "latest".
            username: Optional Gitea username for HTTP Basic auth on the clone.
            password: Optional Gitea password (or PAT) paired with username.

        Returns:
            JSON string with build status and the full registry-qualified image name.
        """
        registry_image = f"{config.DEV_REGISTRY_HOST}/{image_name}:{tag}"
        local_tag = f"localhost/{image_name}:{tag}"

        with tempfile.TemporaryDirectory() as workdir:
            # 1. git clone — embed credentials in the URL (so we don't need a TTY)
            #    and disable git's terminal prompt so a 401 fails fast with a
            #    readable error instead of "could not read Username for ...".
            clone_url = _inject_clone_credentials(repo_url, username, password)
            git_env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
            rc, _, stderr = await _run(
                "git", "clone", "--depth", "1", clone_url, ".",
                cwd=workdir, env=git_env, ctx=ctx,
                log_args=("git", "clone", "--depth", "1", repo_url, "."),
            )
            if rc != 0:
                return json.dumps({
                    "status": "error",
                    "step": "git_clone",
                    "error": stderr.decode(errors="replace").strip(),
                    "repo_url": repo_url,
                }, indent=2)

            # 2. engine build via the local socket (docker → docker build,
            #    podman → podman --remote build).
            rc, _, stderr = await _run(
                *engine_cmd("build", "-t", local_tag, "."),
                cwd=workdir, ctx=ctx,
            )
            if rc != 0:
                return json.dumps({
                    "status": "error",
                    "step": "engine_build",
                    "error": stderr.decode(errors="replace").strip(),
                }, indent=2)

            # 3. engine save → OCI tarball (so skopeo can push it)
            tarball = os.path.join(workdir, "img.tar")
            rc, _, stderr = await _run(
                *engine_cmd("save", "-o", tarball, local_tag),
                ctx=ctx,
            )
            if rc != 0:
                return json.dumps({
                    "status": "error",
                    "step": "engine_save",
                    "error": stderr.decode(errors="replace").strip(),
                }, indent=2)

            # 4. skopeo push to registry-dev (bypasses daemon-side DNS)
            rc, _, stderr = await _run(
                "skopeo", "copy", "--dest-tls-verify=false",
                f"docker-archive:{tarball}",
                f"docker://{registry_image}",
                ctx=ctx,
            )
            if rc != 0:
                return json.dumps({
                    "status": "error",
                    "step": "skopeo_push",
                    "error": stderr.decode(errors="replace").strip(),
                }, indent=2)

        return json.dumps({
            "status": "success",
            "image": registry_image,
            "repo_url": repo_url,
            "message": f"Built {image_name}:{tag} and pushed to {config.DEV_REGISTRY_HOST}.",
        }, indent=2)

    @mcp.tool()
    async def scan_image(
        image_name: str = "hello-app",
        tag: str = "latest",
        ctx: Context | None = None,
    ) -> str:
        """
        Run a (mock) security scan on a container image and return a JSON
        report of vulnerabilities.

        DEFAULTS: if the user just says "scan the image" or "scan the hello world
        app", call with no arguments — defaults to "hello-app:latest".

        Args:
            image_name: Name of the image to scan.
            tag: Tag of the image.

        Returns:
            JSON string with security report.
        """
        import random

        if ctx is not None:
            await ctx.info(f"Scanning {image_name}:{tag}...")

        vulnerabilities = []

        # 20% chance of finding a "critical" vulnerability if not 'auth-service' (just for demo)
        if "auth-service" not in image_name and random.random() < 0.2:
            vulnerabilities.append({
                "id": "CVE-2026-1234",
                "severity": "CRITICAL",
                "package": "openssl",
                "fixed_version": "3.0.15",
                "description": "Buffer overflow in SSL handshake.",
            })

        # Always find some low/medium issues
        vulnerabilities.append({
            "id": "CVE-2026-5678",
            "severity": "LOW",
            "package": "curl",
            "fixed_version": "8.10.1",
            "description": "Minor information leak.",
        })

        status = "PASSED" if not any(v["severity"] == "CRITICAL" for v in vulnerabilities) else "FAILED"

        return json.dumps({
            "status": status,
            "image": f"{image_name}:{tag}",
            "scanner": "Trivy (Mock)",
            "vulnerabilities": vulnerabilities,
            "summary": {
                "critical": sum(1 for v in vulnerabilities if v["severity"] == "CRITICAL"),
                "high": 0,
                "medium": 0,
                "low": sum(1 for v in vulnerabilities if v["severity"] == "LOW"),
            },
        }, indent=2)
