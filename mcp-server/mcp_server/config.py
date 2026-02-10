import os


def _bool_env(key: str, default: bool = False) -> bool:
    return os.environ.get(key, str(default)).lower() in ("true", "1", "yes")


# Service URLs (compose service names or localhost for stdio mode)
USER_API_URL = os.environ.get("USER_API_URL", "http://user-api:8001")
GITEA_URL = os.environ.get("GITEA_URL", "http://gitea:3000")
GITEA_TOKEN = os.environ.get("GITEA_TOKEN", "")
DEV_REGISTRY_URL = os.environ.get("DEV_REGISTRY_URL", "http://registry-dev:5000")
PROD_REGISTRY_URL = os.environ.get("PROD_REGISTRY_URL", "http://registry-prod:5000")
PROMOTION_SERVICE_URL = os.environ.get("PROMOTION_SERVICE_URL", "http://promotion-service:8002")

# Feature switches
GITEA_MCP_ENABLED = _bool_env("GITEA_MCP_ENABLED")
REGISTRY_MCP_ENABLED = _bool_env("REGISTRY_MCP_ENABLED")
PROMOTION_MCP_ENABLED = _bool_env("PROMOTION_MCP_ENABLED")

# Transport
MCP_TRANSPORT = os.environ.get("MCP_TRANSPORT", "sse")
