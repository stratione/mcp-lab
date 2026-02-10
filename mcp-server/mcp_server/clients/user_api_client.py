import httpx
from .. import config


async def list_users() -> list[dict]:
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{config.USER_API_URL}/users", timeout=10.0)
        resp.raise_for_status()
        return resp.json()


async def get_user(user_id: int) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{config.USER_API_URL}/users/{user_id}", timeout=10.0)
        resp.raise_for_status()
        return resp.json()


async def get_user_by_username(username: str) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{config.USER_API_URL}/users/by-username/{username}", timeout=10.0)
        resp.raise_for_status()
        return resp.json()


async def create_user(username: str, email: str, full_name: str, role: str = "developer") -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{config.USER_API_URL}/users",
            json={"username": username, "email": email, "full_name": full_name, "role": role},
            timeout=10.0,
        )
        resp.raise_for_status()
        return resp.json()


async def update_user(user_id: int, **kwargs) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.put(
            f"{config.USER_API_URL}/users/{user_id}",
            json={k: v for k, v in kwargs.items() if v is not None},
            timeout=10.0,
        )
        resp.raise_for_status()
        return resp.json()


async def deactivate_user(user_id: int) -> dict:
    return await update_user(user_id, is_active=False)
