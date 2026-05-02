"""Milestone 6 — workshop launcher (scripts/7-workshop.sh) and between-session
reset (scripts/8-reset.sh).

Unit tests pin the API contracts the scripts depend on. Integration tests
exercise the scripts against the live lab and are marked `integration`.
"""

import os
import re
import subprocess
import time
from pathlib import Path

import httpx
import pytest


REPO_ROOT = Path("/Users/noelorona/Desktop/repos/mcp-lab")
CHAT_UI = "http://localhost:3001"
USER_API = "http://localhost:8001"
PROD_REG = "http://localhost:5002"


# ─── Unit-level tests (fast) ───

@pytest.mark.asyncio
async def test_delete_chat_history_endpoint_clears_persisted_history(
    client, tmp_path, monkeypatch
):
    """Pin: DELETE /api/chat-history returns 200 and removes the persisted
    state. The reset script depends on this endpoint."""
    # Override the chat data dir so the test doesn't depend on /app/data
    from app import main
    monkeypatch.setattr(main, "CHAT_DATA_DIR", tmp_path)
    monkeypatch.setattr(main, "CHAT_HISTORY_FILE", tmp_path / "chat_history.json")

    save_resp = await client.post(
        "/api/chat-history",
        json={"turns": [{"user": "hi", "reply": "ok"}], "history": [], "sessionTokens": 5},
    )
    assert save_resp.status_code == 200
    g = await client.get("/api/chat-history")
    body = g.json()
    assert body.get("turns"), "save did not persist"
    d = await client.delete("/api/chat-history")
    assert d.status_code == 200
    g2 = await client.get("/api/chat-history")
    body2 = g2.json()
    assert body2.get("turns") == [] or "turns" not in body2 or body2["turns"] == []


def test_dashboard_query_param_handler_present_in_static():
    """Pin: the built UI bundle must contain logic for the `dashboard=open`
    URL param (the launcher appends it to the second tab so the audience
    lands on the compare panel).  After the v1 redesign the vanilla app.js
    was replaced by a Vite-compiled bundle at chat-ui/app/static/assets/index-*.js.
    Minification rewrites `params.get('dashboard') === 'open'` to
    `params.get("dashboard")==="open"` or similar, so we check for the
    individual tokens rather than the combined string."""
    assets_dir = REPO_ROOT / "chat-ui/app/static/assets"
    bundles = list(assets_dir.glob("index-*.js"))
    assert bundles, (
        f"No Vite bundle found in {assets_dir}; run `npm run build` in chat-ui/web"
    )
    bundle_text = bundles[0].read_text(errors="replace")
    # The minifier keeps string literals; check both the param name and value.
    assert "dashboard" in bundle_text, (
        "Vite bundle must contain 'dashboard' URL-param handling so the "
        "launcher's second browser tab opens the compare panel"
    )
    assert '"open"' in bundle_text or "'open'" in bundle_text or "`open`" in bundle_text, (
        "Vite bundle must check for param value 'open' so the launcher works"
    )


def test_workshop_script_exists_and_is_executable():
    s = REPO_ROOT / "scripts/7-workshop.sh"
    assert s.exists(), f"{s} missing"
    assert os.access(s, os.X_OK), f"{s} is not executable"


def test_reset_script_exists_and_is_executable():
    s = REPO_ROOT / "scripts/8-reset.sh"
    assert s.exists(), f"{s} missing"
    assert os.access(s, os.X_OK), f"{s} is not executable"


def test_workshop_script_supports_dry_run_flag():
    """The launcher must accept --dry-run for safe testing."""
    src = (REPO_ROOT / "scripts/7-workshop.sh").read_text()
    assert "--dry-run" in src, "7-workshop.sh must support --dry-run"


# ─── Integration tests (slow — require running lab) ───

def _lab_alive() -> bool:
    try:
        return httpx.get(f"{CHAT_UI}/health", timeout=2).status_code == 200
    except Exception:
        return False


def _seeded_user_count() -> int:
    """Return the number of seeded users (id <= 6)."""
    r = httpx.get(f"{USER_API}/users", timeout=5)
    return sum(1 for u in r.json() if u["id"] <= 6)


@pytest.mark.integration
def test_7_workshop_dry_run_does_not_open_terminal_or_browser():
    """`scripts/7-workshop.sh --dry-run` should print what it WOULD do
    but not actually launch anything. Used for safe testing."""
    if not _lab_alive():
        pytest.skip("lab not running")
    out = subprocess.run(
        [str(REPO_ROOT / "scripts/7-workshop.sh"), "--dry-run"],
        capture_output=True, text=True, timeout=30,
    )
    assert out.returncode == 0, (
        f"dry-run exited {out.returncode}: stdout={out.stdout!r} stderr={out.stderr!r}"
    )
    combined = out.stdout + out.stderr
    assert "would" in combined.lower() or "dry" in combined.lower(), (
        "dry-run must announce what it WOULD do; got:\n" + combined
    )


@pytest.mark.integration
def test_8_reset_removes_users_above_id_6():
    if not _lab_alive():
        pytest.skip("lab not running")
    # Create a temporary user (id will be > 6).
    r = httpx.post(
        f"{USER_API}/users",
        json={"username": "tempdemo", "email": "tempdemo@example.com",
              "full_name": "Temp Demo", "role": "dev"},
        timeout=5,
    )
    if r.status_code not in (200, 201):
        pytest.skip(f"could not create temp user: {r.status_code}")
    new_user = r.json()
    assert new_user["id"] > 6

    # Run reset.
    out = subprocess.run(
        [str(REPO_ROOT / "scripts/8-reset.sh")],
        capture_output=True, text=True, timeout=120,
    )
    assert out.returncode == 0, (
        f"reset exited {out.returncode}: {out.stdout}\n{out.stderr}"
    )

    # Confirm the temp user is gone.
    g = httpx.get(f"{USER_API}/users/{new_user['id']}", timeout=5)
    assert g.status_code == 404, (
        f"temp user {new_user['id']} should have been deleted; got {g.status_code}"
    )
    # Confirm seeded baseline is preserved (>= 5; 'system' user may or may not survive).
    assert _seeded_user_count() >= 5


@pytest.mark.integration
def test_8_reset_returns_hallucination_mode_to_off():
    if not _lab_alive():
        pytest.skip("lab not running")
    httpx.post(f"{CHAT_UI}/api/hallucination-mode", json={"enabled": True}, timeout=5)
    g = httpx.get(f"{CHAT_UI}/api/hallucination-mode", timeout=5).json()
    assert g["enabled"] is True

    subprocess.run(
        [str(REPO_ROOT / "scripts/8-reset.sh")],
        capture_output=True, text=True, timeout=120,
    )

    g2 = httpx.get(f"{CHAT_UI}/api/hallucination-mode", timeout=5).json()
    assert g2["enabled"] is False, "reset must turn hallucination mode OFF"
