import sys
from pathlib import Path

import pytest_asyncio
import httpx

# Make `app` importable as a top-level package when running from chat-ui/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.main import app  # noqa: E402


@pytest_asyncio.fixture
async def client():
    """Async HTTP client wired to the FastAPI app via in-process ASGI transport."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
