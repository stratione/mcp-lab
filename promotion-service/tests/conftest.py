import sys
from pathlib import Path

import pytest
import pytest_asyncio
import httpx

# Make `app` importable as a top-level package when running from promotion-service/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import promote  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture
def lab_db(tmp_path, monkeypatch):
    """Fresh SQLite DB per test, with policy env reset to code defaults
    (two-stage flow, no scan gate, max_critical 0)."""
    monkeypatch.setattr(promote, "DB_PATH", str(tmp_path / "promotions.db"))
    for var in (
        "PROMOTION_FLOW",
        "PROMOTION_REQUIRE_SCAN",
        "PROMOTION_MAX_CRITICAL",
        "DEV_REGISTRY_URL",
        "STAGING_REGISTRY_URL",
        "PROD_REGISTRY_URL",
    ):
        monkeypatch.delenv(var, raising=False)
    promote.init_db()
    return promote


@pytest_asyncio.fixture
async def client(lab_db):
    """Async HTTP client wired to the FastAPI app via in-process ASGI transport.

    ASGITransport does not run startup events, so lab_db calls init_db()
    itself against the per-test DB path.
    """
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.fixture
def registry_state():
    """Shared in-memory registry: (image, tag, registry_name) → current digest.

    fake_copy/fake_repoint write to it (a push moves a tag's digest) and
    fake_resolve reads from it, so the digest-bound scan gate and rollback see a
    consistent picture without a real registry. Tests can poke an entry directly
    to simulate a tag being re-pointed (the TOCTOU case).
    """
    return {}


# Stable digest returned for any (image, tag, registry) the tests never push to
# — distinct from fake_copy's zero-padded digests so rollback target selection
# (most recent digest differing from current) behaves deterministically.
DEFAULT_DIGEST = "sha256:" + "e" * 64


@pytest.fixture(autouse=True)
def fake_resolve(monkeypatch, registry_state):
    """Auto-stub digest resolution so unit tests never touch a real registry.

    Returns the digest currently stored in `registry_state` for a tag, or a
    stable DEFAULT_DIGEST for tags nothing has pushed to (so a scan and its
    later gate check agree on the digest).
    """
    async def _resolve(image_name, ref, registry_name):
        return registry_state.get((image_name, ref, registry_name), DEFAULT_DIGEST), "resolved"

    monkeypatch.setattr(promote, "resolve_digest", _resolve)
    return registry_state


@pytest.fixture
def fake_copy(monkeypatch, registry_state):
    """Replace the registry copy with a recorder that always succeeds.

    Each call returns a distinct digest so promotion history is meaningful
    for rollback tests, and records that digest into `registry_state` for the
    target (modelling a real push). Yields a recorder with `.calls` = list of
    (image, tag, from, to) tuples and `.digests` = the digest each returned.
    """
    calls = []
    digests = []

    async def _copy(image_name, tag, from_registry, to_registry, source_ref=None):
        calls.append((image_name, tag, from_registry, to_registry))
        digest = f"sha256:{len(calls):064d}"
        digests.append(digest)
        registry_state[(image_name, tag, to_registry)] = digest
        return True, digest, "success"

    monkeypatch.setattr(promote, "copy_image", _copy)
    return _CopyRecorder(calls, digests)


class _CopyRecorder:
    def __init__(self, calls, digests):
        self.calls = calls
        self.digests = digests

    def __len__(self):
        return len(self.calls)


@pytest.fixture
def fake_repoint(monkeypatch, registry_state):
    """Replace the in-registry tag re-point with a recorder that succeeds and
    moves the tag's digest in `registry_state` (so a follow-up rollback sees the
    re-pointed digest as current)."""
    calls = []

    async def _repoint(image_name, tag, registry_name, digest):
        calls.append((image_name, tag, registry_name, digest))
        registry_state[(image_name, tag, registry_name)] = digest
        return True, "success"

    monkeypatch.setattr(promote, "repoint_tag", _repoint)
    return calls


async def post_scan(client, image_name="hello-app", tag="latest", registry="dev",
                    critical=0, high=0, medium=0, low=0, total=0,
                    scanned_by="tester", report="", passed=False):
    resp = await client.post("/scans", json={
        "image_name": image_name, "tag": tag, "registry": registry,
        "scanned_by": scanned_by, "critical": critical, "high": high,
        "medium": medium, "low": low, "total": total, "passed": passed,
        "report": report,
    })
    return resp


async def post_promote(client, image_name="hello-app", tag="latest",
                       promoted_by="admin", from_registry=None, to_registry=None):
    body = {"image_name": image_name, "tag": tag, "promoted_by": promoted_by}
    if from_registry is not None:
        body["from_registry"] = from_registry
    if to_registry is not None:
        body["to_registry"] = to_registry
    return await client.post("/promote", json=body)
