from mcp.server.fastmcp import FastMCP
from ..clients import gitea_client


# Every Gitea tool accepts optional username/password — when both are
# supplied, the request is authenticated as that user (HTTP Basic) and
# the resulting commit/issue/repo is recorded in Gitea as theirs. This
# is the "MCP can act on your behalf" demo path. Without creds, the
# default service token (mcpadmin) is used so existing prompts keep
# working.
#
# Docstring guidance for the LLM is consistent across mutating tools:
#   "If the user identifies themselves (e.g. 'as diana with password
#    secret'), pass username + password; the action will be attributed
#    to them. If they don't identify themselves, omit both — the lab's
#    admin token will be used."

_AUTH_DOC = (
    "If the user identifies themselves (e.g. \"as diana, password secret\"), "
    "pass both username and password — the request authenticates as that user "
    "via HTTP Basic and the action is attributed to them in Gitea. If neither "
    "is given, the lab's admin token is used."
)


def register(mcp: FastMCP):
    @mcp.tool()
    async def list_gitea_repos(username: str | None = None, password: str | None = None) -> str:
        f"""List all Git repositories in Gitea. Returns a JSON array of repo objects.

        Auth: {_AUTH_DOC}
        """
        import json
        repos = await gitea_client.list_repos(username, password)
        summary = [{"full_name": r.get("full_name"), "description": r.get("description"), "html_url": r.get("html_url")} for r in repos]
        return json.dumps(summary, indent=2)

    @mcp.tool()
    async def get_gitea_repo(owner: str, repo: str,
                             username: str | None = None, password: str | None = None) -> str:
        f"""Get details of a specific Gitea repository. Returns repo info as JSON.

        Auth: {_AUTH_DOC}
        """
        import json
        data = await gitea_client.get_repo(owner, repo, username, password)
        return json.dumps(data, indent=2)

    @mcp.tool()
    async def create_gitea_repo(name: str, description: str = "", private: bool = False,
                                username: str | None = None, password: str | None = None) -> str:
        f"""Create a new Git repository in Gitea. Returns the created repo as JSON.

        Auth: {_AUTH_DOC} The new repo is owned by whoever authenticated, so
        passing creds is the easy way to demo per-user repos in the workshop.
        """
        import json
        data = await gitea_client.create_repo(name, description, private, username, password)
        return json.dumps({"full_name": data.get("full_name"), "html_url": data.get("html_url"), "clone_url": data.get("clone_url")}, indent=2)

    @mcp.tool()
    async def list_gitea_branches(owner: str, repo: str,
                                  username: str | None = None, password: str | None = None) -> str:
        f"""List all branches in a Gitea repository. Returns branch names as JSON array.

        Auth: {_AUTH_DOC}
        """
        import json
        branches = await gitea_client.list_branches(owner, repo, username, password)
        return json.dumps([{"name": b.get("name")} for b in branches], indent=2)

    @mcp.tool()
    async def create_gitea_branch(owner: str, repo: str, branch_name: str, old_branch: str = "main",
                                  username: str | None = None, password: str | None = None) -> str:
        f"""Create a new branch in a Gitea repository. Returns the new branch info as JSON.

        Auth: {_AUTH_DOC}
        """
        import json
        data = await gitea_client.create_branch(owner, repo, branch_name, old_branch, username, password)
        return json.dumps({"name": data.get("name")}, indent=2)

    @mcp.tool()
    async def get_gitea_file(owner: str, repo: str, filepath: str, ref: str = "main",
                             username: str | None = None, password: str | None = None) -> str:
        f"""Get file contents from a Gitea repository. Returns file info including decoded content.

        Auth: {_AUTH_DOC}
        """
        import json
        import base64
        data = await gitea_client.get_file(owner, repo, filepath, ref, username, password)
        content = ""
        if data.get("content"):
            try:
                content = base64.b64decode(data["content"]).decode()
            except Exception:
                content = data["content"]
        return json.dumps({"name": data.get("name"), "path": data.get("path"), "content": content}, indent=2)

    @mcp.tool()
    async def create_gitea_file(owner: str, repo: str, filepath: str, content: str,
                                message: str = "Add file", branch: str = "main",
                                username: str | None = None, password: str | None = None) -> str:
        f"""Create a new file in a Gitea repository. Returns commit info as JSON.

        Auth: {_AUTH_DOC} The commit is recorded as authored by whoever
        authenticated — passing the user's creds shows the chat user named in
        the Git history, not the lab admin.
        """
        import json
        data = await gitea_client.create_file(owner, repo, filepath, content, message, branch, username, password)
        return json.dumps({"path": filepath, "commit": data.get("commit", {}).get("sha", "")[:12]}, indent=2)
