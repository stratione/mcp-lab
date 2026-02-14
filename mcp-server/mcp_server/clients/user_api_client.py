import httpx
from .. import config
from . import check_response


async def list_roles() -> list[dict]:
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{config.USER_API_URL}/users/roles", timeout=10.0)
        check_response(resp)
        return resp.json()


async def list_users() -> list[dict]:
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{config.USER_API_URL}/users", timeout=10.0)
        check_response(resp)
        return resp.json()


async def get_user(user_id: int) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{config.USER_API_URL}/users/{user_id}", timeout=10.0)
        check_response(resp)
        return resp.json()


async def get_user_by_username(username: str) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{config.USER_API_URL}/users/by-username/{username}", timeout=10.0)
        check_response(resp)
        return resp.json()


async def create_user(username: str, email: str, full_name: str, role: str) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{config.USER_API_URL}/users",
            json={"username": username, "email": email, "full_name": full_name, "role": role},
            timeout=10.0,
        )
        check_response(resp)
        return resp.json()


async def update_user(user_id: int, **kwargs) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.put(
            f"{config.USER_API_URL}/users/{user_id}",
            json={k: v for k, v in kwargs.items() if v is not None},
            timeout=10.0,
        )
        check_response(resp)
        return resp.json()


async def deactivate_user(user_id: int) -> dict:
    return await update_user(user_id, is_active=False)


async def delete_user(user_id: int) -> None:
    async with httpx.AsyncClient() as client:
        resp = await client.delete(f"{config.USER_API_URL}/users/{user_id}", timeout=10.0)
        check_response(resp)
