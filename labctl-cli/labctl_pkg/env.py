"""Lab configuration: .env reading, engine detection, canonical constants.

Endpoint URLs default to the contract's host-side ports but can be overridden
with LABCTL_*_URL environment variables (used by the test suite to point at
stdlib http.server fakes).
"""

import os
import shutil

from .errors import LabError

# ── canonical constants (contract §1) ───────────────────────────────────────
NETWORK = "mcp-lab-net"
APP_CONTAINER_TPL = "mcp-lab-app-{env}"
DEPLOY_PORTS = {"dev": 9080, "staging": 9081, "prod": 9082}
APP_CONTAINER_PORT = 8080
REGISTRY_HOST_PORTS = {"dev": 5001, "staging": 5003, "prod": 5002}
# In-network registry hostnames (what trivy / CI containers see):
REGISTRY_INTERNAL_HOSTS = {
    "dev": "registry-dev:5000",
    "staging": "registry-staging:5000",
    "prod": "registry-prod:5000",
}
REGISTRY_NAMES = ("dev", "staging", "prod")
ENVS = ("dev", "staging", "prod")

GITEA_USER = "mcpadmin"
GITEA_PASS = "mcpadmin123"
DEFAULT_OWNER = "mcpadmin"
DEFAULT_REPO = "sample-app"

TRIVY_SERVER_URL = "http://trivy:8080"  # in-network (used by `labctl scan`)

_TOKEN_PLACEHOLDERS = {"", "your-gitea-token-here"}


def _default_repo_root():
    # <repo>/labctl/labctl_pkg/env.py → three dirname()s up
    here = os.path.abspath(__file__)
    return os.path.dirname(os.path.dirname(os.path.dirname(here)))


def read_dotenv(path):
    """Minimal KEY=VALUE .env reader (comments and blank lines ignored)."""
    values = {}
    try:
        with open(path, "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                value = value.strip().strip('"').strip("'")
                values[key.strip()] = value
    except OSError:
        pass
    return values


def autodetect_engine():
    for engine in ("docker", "podman"):
        if shutil.which(engine):
            return engine
    return "docker"


class Config:
    """Resolved lab configuration for one labctl invocation."""

    def __init__(self, engine_override=None):
        environ = os.environ
        self.repo_root = environ.get("LABCTL_REPO_ROOT") or _default_repo_root()
        self.dotenv = read_dotenv(os.path.join(self.repo_root, ".env"))

        self.gitea_url = environ.get("LABCTL_GITEA_URL", "http://localhost:3000")
        self.user_api_url = environ.get("LABCTL_USER_API_URL", "http://localhost:8001")
        self.promotion_url = environ.get("LABCTL_PROMOTION_URL", "http://localhost:8002")
        self.chat_ui_url = environ.get("LABCTL_CHAT_UI_URL", "http://localhost:3001")
        self.trivy_url = environ.get("LABCTL_TRIVY_URL", "http://localhost:8087")
        self.registry_urls = {
            "dev": environ.get("LABCTL_REGISTRY_DEV_URL", "http://localhost:5001"),
            "staging": environ.get("LABCTL_REGISTRY_STAGING_URL", "http://localhost:5003"),
            "prod": environ.get("LABCTL_REGISTRY_PROD_URL", "http://localhost:5002"),
        }

        self.gitea_user = GITEA_USER
        self.gitea_pass = GITEA_PASS
        token = (self.dotenv.get("GITEA_TOKEN") or "").strip()
        self.gitea_token = "" if token in _TOKEN_PLACEHOLDERS else token

        # --engine flag > CONTAINER_ENGINE in .env > auto-detect > docker
        engine = engine_override or (self.dotenv.get("CONTAINER_ENGINE") or "").strip()
        self.engine = engine or autodetect_engine()
        if self.engine not in ("docker", "podman"):
            raise LabError(
                "unsupported container engine '{}' — use --engine docker|podman".format(self.engine)
            )

    def registry_url(self, name):
        try:
            return self.registry_urls[name]
        except KeyError:
            raise LabError("unknown registry '{}' (use dev|staging|prod)".format(name))


class Context:
    """Carries config + global flags into every command implementation."""

    def __init__(self, cfg, verbose=False, json_mode=False):
        self.cfg = cfg
        self.verbose = verbose
        self.json_mode = json_mode


def parse_image_ref(spec, default_tag="latest"):
    """'name:tag' → (name, tag); bare 'name' → (name, default_tag)."""
    name, sep, tag = spec.partition(":")
    if not name:
        raise LabError("invalid image reference '{}'".format(spec))
    return name, (tag if sep and tag else default_tag)


def split_repo(spec):
    """'owner/repo' or bare 'repo' (owner defaults to mcpadmin)."""
    if "/" in spec:
        owner, _, repo = spec.partition("/")
    else:
        owner, repo = DEFAULT_OWNER, spec
    if not owner or not repo:
        raise LabError("invalid repository '{}' (expected [owner/]repo)".format(spec))
    return owner, repo
