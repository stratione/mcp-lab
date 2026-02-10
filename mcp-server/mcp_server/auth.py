from . import config


def gitea_headers() -> dict:
    """Return headers with injected Gitea auth token."""
    headers = {"Content-Type": "application/json"}
    if config.GITEA_TOKEN:
        headers["Authorization"] = f"token {config.GITEA_TOKEN}"
    return headers
