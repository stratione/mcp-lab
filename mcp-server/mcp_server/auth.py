import base64

from . import config


def gitea_headers(username: str | None = None, password: str | None = None) -> dict:
    """Return Gitea request headers.

    If both username and password are provided, authenticates as that user
    via HTTP Basic — the resulting action is recorded in Gitea as theirs
    (the "MCP acting on your behalf" demo path). Otherwise falls back to
    the service token in $GITEA_TOKEN so default usage keeps working when
    no user creds are supplied.
    """
    headers = {"Content-Type": "application/json"}
    if username and password:
        encoded = base64.b64encode(f"{username}:{password}".encode()).decode()
        headers["Authorization"] = f"Basic {encoded}"
    elif config.GITEA_TOKEN:
        headers["Authorization"] = f"token {config.GITEA_TOKEN}"
    return headers
