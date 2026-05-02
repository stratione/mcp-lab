import httpx
from .. import config
from ..auth import gitea_headers
from . import check_response


# Every function takes optional username/password — when both are passed,
# the request is authenticated as that user (HTTP Basic). Otherwise the
# default service token is used. See ../auth.py:gitea_headers.


async def list_repos(username: str | None = None, password: str | None = None) -> list[dict]:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{config.GITEA_URL}/api/v1/repos/search",
            headers=gitea_headers(username, password),
            timeout=10.0,
        )
        check_response(resp)
        data = resp.json()
        return data.get("data", data) if isinstance(data, dict) else data


async def get_repo(owner: str, repo: str, username: str | None = None, password: str | None = None) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{config.GITEA_URL}/api/v1/repos/{owner}/{repo}",
            headers=gitea_headers(username, password),
            timeout=10.0,
        )
        check_response(resp)
        return resp.json()


async def create_repo(name: str, description: str = "", private: bool = False,
                      username: str | None = None, password: str | None = None) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{config.GITEA_URL}/api/v1/user/repos",
            headers=gitea_headers(username, password),
            json={"name": name, "description": description, "private": private, "auto_init": True},
            timeout=10.0,
        )
        check_response(resp)
        return resp.json()


async def list_branches(owner: str, repo: str,
                        username: str | None = None, password: str | None = None) -> list[dict]:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{config.GITEA_URL}/api/v1/repos/{owner}/{repo}/branches",
            headers=gitea_headers(username, password),
            timeout=10.0,
        )
        check_response(resp)
        return resp.json()


async def create_branch(owner: str, repo: str, branch_name: str, old_branch: str = "main",
                        username: str | None = None, password: str | None = None) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{config.GITEA_URL}/api/v1/repos/{owner}/{repo}/branches",
            headers=gitea_headers(username, password),
            json={"new_branch_name": branch_name, "old_branch_name": old_branch},
            timeout=10.0,
        )
        check_response(resp)
        return resp.json()


async def get_file(owner: str, repo: str, filepath: str, ref: str = "main",
                   username: str | None = None, password: str | None = None) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{config.GITEA_URL}/api/v1/repos/{owner}/{repo}/contents/{filepath}",
            headers=gitea_headers(username, password),
            params={"ref": ref},
            timeout=10.0,
        )
        check_response(resp)
        return resp.json()


async def create_file(owner: str, repo: str, filepath: str, content: str,
                      message: str = "Add file", branch: str = "main",
                      username: str | None = None, password: str | None = None) -> dict:
    import base64
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{config.GITEA_URL}/api/v1/repos/{owner}/{repo}/contents/{filepath}",
            headers=gitea_headers(username, password),
            json={
                "content": base64.b64encode(content.encode()).decode(),
                "message": message,
                "branch": branch,
            },
            timeout=10.0,
        )
        check_response(resp)
        return resp.json()
