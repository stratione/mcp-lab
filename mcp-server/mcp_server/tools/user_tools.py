from mcp.server.fastmcp import FastMCP
from ..clients import user_api_client


def register(mcp: FastMCP):
    @mcp.tool()
    async def list_roles() -> str:
        """List all valid user roles and their descriptions. Call this before creating a user if the role was not explicitly specified."""
        import json
        roles = await user_api_client.list_roles()
        return json.dumps(roles, indent=2)

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
    async def create_user(username: str, email: str, full_name: str, role: str) -> str:
        """Create a new user. ALL fields are required: username, email, full_name, and role. If the user did not provide an email or role, you MUST ask them before calling this tool. Call list_roles first to get valid role values. Do not guess or default any field. Returns the created user as JSON."""
        import json
        # Reject empty required fields with a helpful message so the LLM can retry
        missing = []
        if not username.strip():
            missing.append("username")
        if not email.strip():
            missing.append("email")
        if not full_name.strip():
            missing.append("full_name")
        if not role.strip():
            missing.append("role")
        if missing:
            return json.dumps({"error": f"Missing required fields: {', '.join(missing)}. Ask the user to provide them before retrying."})
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

    @mcp.tool()
    async def delete_user(user_id: int) -> str:
        """Permanently delete a single user by their numeric ID. This cannot be undone. To delete multiple users, call this tool once for each user ID — do NOT pass a list. Returns a confirmation message."""
        import json
        await user_api_client.delete_user(user_id)
        return json.dumps({"deleted": True, "user_id": user_id})

    @mcp.tool()
    async def delete_all_users() -> str:
        """Permanently delete ALL users in the system. This cannot be undone. Use when the user asks to delete all users or wipe/reset the user list. Returns a summary of how many users were deleted."""
        import json
        users = await user_api_client.list_users()
        deleted = []
        errors = []
        for u in users:
            try:
                await user_api_client.delete_user(u["id"])
                deleted.append(u["id"])
            except Exception as e:
                errors.append({"id": u["id"], "error": str(e)})
        result = {"deleted_count": len(deleted), "deleted_ids": deleted}
        if errors:
            result["errors"] = errors
        return json.dumps(result, indent=2)
