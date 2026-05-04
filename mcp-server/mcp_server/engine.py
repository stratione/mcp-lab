"""Engine-aware command dispatch for the runner / deploy tools.

The lab supports two container engines: Docker (Desktop) and Podman. Both
expose a daemon socket at /var/run/docker.sock inside the runner container,
but they speak different APIs:

  - Docker → Docker Engine REST API
  - Podman → libpod REST API (only when `podman.socket` is enabled)

`podman --remote --url unix:///var/run/docker.sock` works for the Podman
case but returns 404 against Docker's API. So we dispatch on
CONTAINER_ENGINE (set by the host's setup script) and use the matching
CLI: `docker` natively, `podman --remote` for Podman.
"""
import os


def engine_cmd(*subcommand: str) -> list[str]:
    """Argv prefix for an engine subcommand.

    docker engine → ["docker", *subcommand]
    podman engine → ["podman", "--remote", "--url", PODMAN_REMOTE_URL, *subcommand]
    """
    engine = os.environ.get("CONTAINER_ENGINE", "docker").strip().lower()
    if engine == "podman":
        url = os.environ.get("PODMAN_REMOTE_URL", "unix:///var/run/docker.sock")
        return ["podman", "--remote", "--url", url, *subcommand]
    return ["docker", *subcommand]
