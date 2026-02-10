from mcp.server.fastmcp import FastMCP
from ..clients import gitea_client


def register(mcp: FastMCP):
    @mcp.tool()
    async def list_gitea_repos() -> str:
        """List all Git repositories in Gitea. Returns a JSON array of repo objects."""
        import json
        repos = await gitea_client.list_repos()
        summary = [{"full_name": r.get("full_name"), "description": r.get("description"), "html_url": r.get("html_url")} for r in repos]
        return json.dumps(summary, indent=2)

    @mcp.tool()
    async def get_gitea_repo(owner: str, repo: str) -> str:
        """Get details of a specific Gitea repository. Returns repo info as JSON."""
        import json
        data = await gitea_client.get_repo(owner, repo)
        return json.dumps(data, indent=2)

    @mcp.tool()
    async def create_gitea_repo(name: str, description: str = "", private: bool = False) -> str:
        """Create a new Git repository in Gitea. Returns the created repo as JSON."""
        import json
        data = await gitea_client.create_repo(name, description, private)
        return json.dumps({"full_name": data.get("full_name"), "html_url": data.get("html_url"), "clone_url": data.get("clone_url")}, indent=2)

    @mcp.tool()
    async def list_gitea_branches(owner: str, repo: str) -> str:
        """List all branches in a Gitea repository. Returns branch names as JSON array."""
        import json
        branches = await gitea_client.list_branches(owner, repo)
        return json.dumps([{"name": b.get("name")} for b in branches], indent=2)

    @mcp.tool()
    async def create_gitea_branch(owner: str, repo: str, branch_name: str, old_branch: str = "main") -> str:
        """Create a new branch in a Gitea repository. Returns the new branch info as JSON."""
        import json
        data = await gitea_client.create_branch(owner, repo, branch_name, old_branch)
        return json.dumps({"name": data.get("name")}, indent=2)

    @mcp.tool()
    async def get_gitea_file(owner: str, repo: str, filepath: str, ref: str = "main") -> str:
        """Get file contents from a Gitea repository. Returns file info including decoded content."""
        import json
        import base64
        data = await gitea_client.get_file(owner, repo, filepath, ref)
        content = ""
        if data.get("content"):
            try:
                content = base64.b64decode(data["content"]).decode()
            except Exception:
                content = data["content"]
        return json.dumps({"name": data.get("name"), "path": data.get("path"), "content": content}, indent=2)

    @mcp.tool()
    async def create_gitea_file(owner: str, repo: str, filepath: str, content: str, message: str = "Add file", branch: str = "main") -> str:
        """Create a new file in a Gitea repository. Returns commit info as JSON."""
        import json
        data = await gitea_client.create_file(owner, repo, filepath, content, message, branch)
        return json.dumps({"path": filepath, "commit": data.get("commit", {}).get("sha", "")[:12]}, indent=2)
