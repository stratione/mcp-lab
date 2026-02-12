from mcp.server.fastmcp import FastMCP
from ..clients import user_api_client


def register(mcp: FastMCP):
    @mcp.tool()
    async def list_users() -> str:
        """List all users in the system. Returns a JSON array of user objects."""
        import json
        users = await user_api_client.list_users()
        return json.dumps(users, indent=2)

    @mcp.tool()
    async def get_user(user_id: int) -> str:
        """Get a specific user by their numeric ID. Returns the user object as JSON."""
        import json
        user = await user_api_client.get_user(user_id)
        return json.dumps(user, indent=2)

    @mcp.tool()
    async def get_user_by_username(username: str) -> str:
        """Look up a user by their username. Returns the user object as JSON."""
        import json
        user = await user_api_client.get_user_by_username(username)
        return json.dumps(user, indent=2)

    @mcp.tool()
    async def create_user(username: str, email: str, full_name: str, role: str = "dev") -> str:
        """Create a new user. Role must be 'admin', 'dev', or 'viewer'. Returns the created user as JSON."""
        import json
        user = await user_api_client.create_user(username, email, full_name, role)
        return json.dumps(user, indent=2)

    @mcp.tool()
    async def update_user(user_id: int, email: str = "", full_name: str = "", role: str = "") -> str:
        """Update an existing user's fields. Only non-empty fields are updated. Returns the updated user as JSON."""
        import json
        kwargs = {}
        if email:
            kwargs["email"] = email
        if full_name:
            kwargs["full_name"] = full_name
        if role:
            kwargs["role"] = role
        user = await user_api_client.update_user(user_id, **kwargs)
        return json.dumps(user, indent=2)

    @mcp.tool()
    async def deactivate_user(user_id: int) -> str:
        """Deactivate a user by their numeric ID. Sets is_active to false. Returns the updated user as JSON."""
        import json
        user = await user_api_client.deactivate_user(user_id)
        return json.dumps(user, indent=2)
