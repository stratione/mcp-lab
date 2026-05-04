"""Engine-aware command dispatch for the runner / deploy tools.

The lab supports two container engines: Docker (Desktop) and Podman. Both
expose a daemon socket at /var/run/docker.sock inside the runner container,
but they speak different APIs:

  - Docker → Docker Engine REST API (`Server: Docker/X.Y.Z` on /_ping)
  - Podman → libpod REST API (`Server: Libpod/X.Y.Z` on /_ping)

`podman --remote --url unix:///var/run/docker.sock` works for the Podman
case but returns 404 against Docker's API. So we auto-detect which engine
is actually behind the socket — independent of any CONTAINER_ENGINE env
var, which can drift if the user switched engines without rerunning
setup. The env var is still honored as a forced override for users who
want to test the other engine's path explicitly.
"""
import os
import socket as _socket


_DETECTED_ENGINE: str | None = None


def _probe_socket_engine(path: str = "/var/run/docker.sock") -> str | None:
    """Probe the bound socket and return 'docker' / 'podman' / None.

    Speaks raw HTTP/1.0 over the unix socket — no extra dependencies. The
    Docker daemon and Podman's docker-compat API both answer GET /_ping
    with HTTP 200 OK and a `Server:` header that names the engine.
    """
    try:
        s = _socket.socket(_socket.AF_UNIX)
        s.settimeout(2.0)
        s.connect(path)
        s.send(b"GET /_ping HTTP/1.0\r\nHost: x\r\n\r\n")
        chunks: list[bytes] = []
        while True:
            chunk = s.recv(4096)
            if not chunk:
                break
            chunks.append(chunk)
            if len(chunks) > 4:
                break
        s.close()
        resp = b"".join(chunks).lower()
        if b"server: docker" in resp:
            return "docker"
        if b"server: libpod" in resp:
            return "podman"
    except OSError:
        pass
    return None


def detected_engine() -> str:
    """Return the engine the lab should target.

    Priority:
      1. CONTAINER_ENGINE_FORCE (explicit override — useful for testing
         the other engine's code path without flipping the daemon).
      2. Socket probe — whoever is actually answering on /var/run/docker.sock.
      3. CONTAINER_ENGINE env var (set by setup script).
      4. Default: "docker".

    Cached for the lifetime of the process.
    """
    global _DETECTED_ENGINE
    if _DETECTED_ENGINE is not None:
        return _DETECTED_ENGINE

    forced = os.environ.get("CONTAINER_ENGINE_FORCE", "").strip().lower()
    if forced in ("docker", "podman"):
        _DETECTED_ENGINE = forced
        return _DETECTED_ENGINE

    probed = _probe_socket_engine()
    if probed:
        _DETECTED_ENGINE = probed
        return _DETECTED_ENGINE

    _DETECTED_ENGINE = os.environ.get("CONTAINER_ENGINE", "docker").strip().lower() or "docker"
    return _DETECTED_ENGINE


def engine_cmd(*subcommand: str) -> list[str]:
    """Argv prefix for an engine subcommand.

    docker engine → ["docker", *subcommand]
    podman engine → ["podman", "--remote", "--url", PODMAN_REMOTE_URL, *subcommand]
    """
    if detected_engine() == "podman":
        url = os.environ.get("PODMAN_REMOTE_URL", "unix:///var/run/docker.sock")
        return ["podman", "--remote", "--url", url, *subcommand]
    return ["docker", *subcommand]
