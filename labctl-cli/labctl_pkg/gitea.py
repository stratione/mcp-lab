"""Gitea API client: repos, contents (create-or-update with sha), Actions runs.

Auth: GITEA_TOKEN from .env when present, otherwise basic mcpadmin/mcpadmin123
(lab-only credentials, documented in the contract).
"""

import base64
from urllib.parse import quote

from . import http
from .errors import LabError

TERMINAL_RUN_STATUSES = {"success", "failure", "cancelled", "skipped"}


def auth(cfg):
    if cfg.gitea_token:
        return ("token", cfg.gitea_token)
    return ("basic", cfg.gitea_user, cfg.gitea_pass)


def api(ctx, method, path, json_body=None, query=""):
    url = ctx.cfg.gitea_url + "/api/v1" + path
    if query:
        url += "?" + query
    return http.request(ctx, method, url, json_body=json_body,
                        auth=auth(ctx.cfg), service="gitea")


def list_repos(ctx):
    resp = api(ctx, "GET", "/repos/search", query="limit=50")
    if resp.status != 200:
        raise LabError("gitea repo search failed (HTTP {}): {}".format(resp.status, resp.detail()))
    data = resp.json()
    if isinstance(data, dict):
        return data.get("data", [])
    return data or []


def get_contents(ctx, owner, repo, path, ref="main"):
    return api(ctx, "GET", "/repos/{}/{}/contents/{}".format(owner, repo, quote(path)),
               query="ref={}".format(ref))


def put_contents(ctx, owner, repo, path, content, message, branch="main"):
    """Create-or-update a file via the contents API. Idempotent.

    Returns "created" | "updated" | "unchanged".
    """
    existing = get_contents(ctx, owner, repo, path, ref=branch)
    b64 = base64.b64encode(content.encode("utf-8")).decode("ascii")
    url_path = "/repos/{}/{}/contents/{}".format(owner, repo, quote(path))

    if existing.status == 200:
        info = existing.json()
        current = base64.b64decode(info.get("content") or b"").decode("utf-8", errors="replace")
        if current == content:
            return "unchanged"
        resp = api(ctx, "PUT", url_path, json_body={
            "content": b64, "message": message, "sha": info.get("sha"), "branch": branch,
        })
        if resp.status not in (200, 201):
            raise LabError("gitea update of {} failed (HTTP {}): {}".format(
                path, resp.status, resp.detail()))
        return "updated"

    if existing.status == 404:
        resp = api(ctx, "POST", url_path, json_body={
            "content": b64, "message": message, "branch": branch,
        })
        if resp.status not in (200, 201):
            raise LabError("gitea create of {} failed (HTTP {}): {}".format(
                path, resp.status, resp.detail()))
        return "created"

    raise LabError("gitea contents lookup for {} failed (HTTP {}): {}".format(
        path, existing.status, existing.detail()))


def list_runs(ctx, owner, repo):
    """Gitea Actions runs via /repos/{owner}/{repo}/actions/tasks."""
    resp = api(ctx, "GET", "/repos/{}/{}/actions/tasks".format(owner, repo), query="limit=20")
    if resp.status == 404:
        raise LabError(
            "Gitea Actions API not available for {}/{} — is Actions enabled? "
            "(full tier: ./labctl up --tier=full)".format(owner, repo))
    if resp.status != 200:
        raise LabError("gitea actions query failed (HTTP {}): {}".format(resp.status, resp.detail()))
    data = resp.json()
    if isinstance(data, dict):
        return data.get("workflow_runs") or []
    return data or []


def list_commits(ctx, owner, repo, limit=20):
    """Returns the commit list, or None if the repo does not exist."""
    resp = api(ctx, "GET", "/repos/{}/{}/commits".format(owner, repo),
               query="limit={}&sha=main".format(limit))
    if resp.status == 404:
        return None
    if resp.status != 200:
        raise LabError("gitea commits query failed (HTTP {}): {}".format(resp.status, resp.detail()))
    data = resp.json()
    return data if isinstance(data, list) else []
