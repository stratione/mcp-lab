import httpx


def check_response(resp: httpx.Response):
    """Raise a descriptive error for non-2xx responses, including the API's detail message."""
    if resp.status_code < 400:
        return
    try:
        body = resp.json()
        detail = body.get("detail", body) if isinstance(body, dict) else body
    except Exception:
        detail = resp.text[:500]
    raise Exception(f"HTTP {resp.status_code}: {detail}")
