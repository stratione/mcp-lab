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
    async def create_user(
        username: str, 
        email_provided_by_user: str, 
        full_name_provided_by_user: str, 
        role_provided_by_user: str, 
        dry_run: bool = False
    ) -> str:
        """
        Create a new user. You must NOT hallucinate or guess these values.
        
        Args:
            username: User's login name.
            email_provided_by_user: The email address EXPLICITLY provided by the user in the chat.
            full_name_provided_by_user: The full name EXPLICITLY provided by the user.
            role_provided_by_user: The role EXPLICITLY provided by the user.
            dry_run: Validate inputs without creating.
            
        CRITICAL: If you do not have these exact values from the user, DO NOT CALL THIS TOOL. Ask the user first.
        """
        import json
        
        # Map back to API expected names
        email = email_provided_by_user.strip()
        full_name = full_name_provided_by_user.strip()
        role = role_provided_by_user.strip()

        # 1. Check for empty fields
        if not username or not email or not full_name or not role:
            return json.dumps({"error": "All fields are required. Please ask the user for the missing information."})

        # 2. Strict User Entry Quality Checks (anti-hallucination)
        
        # Full Name must look like a full name (at least 2 words)
        if " " not in full_name:
             return json.dumps({"error": f"Invalid full name '{full_name}'. It must contain at least a first and last name (e.g., 'Alice Johnson'). Please ask the user for their full name."})

        # Email must generally look valid and NOT be a common hallucination
        hallucinated_domains = ["example.com", "test.com", "his-email.com", "her-mail.com", "email.com", "domain.com"]
        if any(d in email.lower() for d in hallucinated_domains):
             return json.dumps({"error": f"Invalid email domain in '{email}'. Please ask the user for their REAL email address."})

        if dry_run:
             return json.dumps({"status": "valid", "message": "Inputs appear valid. Remove dry_run=True to create."})

        try:
            user = await user_api_client.create_user(username, email, full_name, role)
            return json.dumps(user, indent=2)
        except Exception as e:
            return json.dumps({"error": str(e)})

        if dry_run:
             return json.dumps({"status": "valid", "message": "Inputs appear valid. Remove dry_run=True to create."})

        try:
            user = await user_api_client.create_user(username, email, full_name, role)
            return json.dumps(user, indent=2)
        except Exception as e:
            return json.dumps({"error": str(e)})

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
