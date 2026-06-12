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

import httpx
from mcp.server.fastmcp import FastMCP, Context

from .. import config
from ..clients import check_response
from ..engine import engine_cmd


# Trivy reports get truncated to this size before being recorded with the
# promotion service (matches the service's own 200 KB cap).
_MAX_REPORT_BYTES = 200_000


def _registry_host(registry: str) -> str:
    """Lab-network hostname (no scheme) for a registry name."""
    return {
        "dev": config.DEV_REGISTRY_HOST,
        "staging": config.STAGING_REGISTRY_HOST,
        "prod": config.PROD_REGISTRY_HOST,
    }[registry]


def _severity_counts(report: dict) -> dict:
    """Tally severity counts from a Trivy JSON report.

    Trivy omits `Results` for images with no targets and `Vulnerabilities`
    for clean targets, so every key access is defensive.
    """
    counts = {"critical": 0, "high": 0, "medium": 0, "low": 0, "total": 0}
    for result in report.get("Results") or []:
        if not isinstance(result, dict):
            continue
        for vuln in result.get("Vulnerabilities") or []:
            if not isinstance(vuln, dict):
                continue
            counts["total"] += 1
            severity = str(vuln.get("Severity", "")).lower()
            if severity in counts:
                counts[severity] += 1
    return counts


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
        registry: str = "dev",
        ctx: Context | None = None,
    ) -> str:
        """
        Run a REAL Trivy security scan on a container image in one of the lab
        registries, record the result with the promotion service (so the
        scan gate can see it), and return a human-readable summary.

        DEFAULTS: if the user just says "scan the image" or "scan the hello world
        app", call with no arguments — defaults to "hello-app:latest" in the
        dev registry.

        Args:
            image_name: Name of the image to scan.
            tag: Tag of the image.
            registry: Which registry holds the image — dev, staging or prod.

        Returns:
            Summary string: severity counts, PASSED/FAILED, and the scan
            record id.
        """
        if registry not in ("dev", "staging", "prod"):
            return (
                f"Invalid registry: {registry!r}. Must be one of: dev, staging, prod."
            )

        image_ref = f"{_registry_host(registry)}/{image_name}:{tag}"

        # Run the trivy CLIENT as a sibling container on the lab network,
        # pointed at the long-running trivy SERVER (which holds the vuln DB).
        rc, stdout, stderr = await _run(
            *engine_cmd(
                "run", "--rm", "--network", "mcp-lab-net",
                "aquasec/trivy:latest", "image",
                "--server", config.TRIVY_SERVER_URL,
                "--format", "json", "--insecure",
                image_ref,
            ),
            ctx=ctx,
        )
        if rc != 0:
            err = stderr.decode(errors="replace").strip()
            return (
                f"Trivy scan of {image_ref} failed. The trivy server at "
                f"{config.TRIVY_SERVER_URL} may not be running — start it with: "
                f"docker compose --profile security up -d trivy. "
                f"Engine output: {err[-500:]}"
            )

        report_text = stdout.decode(errors="replace")
        try:
            report = json.loads(report_text)
        except ValueError:
            return (
                f"Trivy scan of {image_ref} produced unparseable output. The "
                f"trivy server at {config.TRIVY_SERVER_URL} may not be running — "
                f"start it with: docker compose --profile security up -d trivy."
            )

        # A report with no `Results` key means Trivy produced no vulnerability
        # analysis at all (an image it can't introspect) — distinct from
        # "analyzed and clean", which yields `Results: [...]` with zero vulns.
        # Recording it as a pass would let an unassessed image satisfy the
        # promotion scan gate, so refuse a verdict and record nothing.
        if report.get("Results") is None:
            return (
                f"Trivy scan of {image_ref} produced no analyzable results — the "
                f"report has no `Results` (the image may be unsupported, empty, or "
                f"the wrong reference). Treating as INDETERMINATE, not clean: no "
                f"scan was recorded, so promotion gates will keep blocking. Verify "
                f"the image and registry, then re-scan."
            )

        counts = _severity_counts(report)

        # Record the scan with the promotion service so the scan gate
        # (PROMOTION_REQUIRE_SCAN) can see it. `passed` is computed
        # server-side from the critical count vs policy.
        scan_id = None
        passed = None
        record_note = ""
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    f"{config.PROMOTION_SERVICE_URL}/scans",
                    json={
                        "image_name": image_name,
                        "tag": tag,
                        "registry": registry,
                        "scanned_by": "mcp-runner",
                        "critical": counts["critical"],
                        "high": counts["high"],
                        "medium": counts["medium"],
                        "low": counts["low"],
                        "total": counts["total"],
                        "report": report_text[:_MAX_REPORT_BYTES],
                    },
                    timeout=30.0,
                )
                check_response(resp)
                saved = resp.json()
                scan_id = saved.get("id")
                passed = saved.get("passed")
        except Exception as e:
            record_note = (
                f" WARNING: scan completed but could not be recorded with the "
                f"promotion service at {config.PROMOTION_SERVICE_URL} ({e}); "
                f"promotion scan gates will not see this scan."
            )

        if passed is None:
            # The promotion service (the verdict-of-record, which applies the
            # configured max-critical policy) didn't answer — fall back to a
            # local estimate and label it unverified so it can't be mistaken for
            # an authoritative gate pass.
            passed = counts["critical"] == 0
            verdict = "PASSED (unverified)" if passed else "FAILED (unverified)"
        else:
            verdict = "PASSED" if passed else "FAILED"

        summary = (
            f"Trivy scan of {image_ref}: {counts['critical']} critical, "
            f"{counts['high']} high, {counts['medium']} medium, "
            f"{counts['low']} low ({counts['total']} findings total). "
            f"Result: {verdict}."
        )
        if scan_id is not None:
            summary += f" Scan record id: {scan_id}."
        return summary + record_note
