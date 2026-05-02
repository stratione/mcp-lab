"""Workshop wizard contract tests.

The shell-based workshop launcher (`scripts/workshop.sh`) was removed —
participants now mirror the presenter step-by-step (preflight → setup →
open `http://localhost:3001/?workshop=1`). These tests pin the API + UI
contracts the wizard still depends on:

  - DELETE /api/chat-history clears persisted state.
  - The compiled UI bundle handles the `?dashboard=open` query param.
"""

import pytest


@pytest.mark.asyncio
async def test_delete_chat_history_endpoint_clears_persisted_history(
    client, tmp_path, monkeypatch
):
    """Pin: DELETE /api/chat-history returns 200 and removes the persisted
    state."""
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
    URL param so the wizard can deep-link to the compare panel.
    Minification rewrites `params.get('dashboard') === 'open'` to compact
    forms, so we check for the individual tokens rather than the literal."""
    from pathlib import Path
    REPO_ROOT = Path("/Users/noelorona/Desktop/repos/mcp-lab")
    assets_dir = REPO_ROOT / "chat-ui/app/static/assets"
    bundles = list(assets_dir.glob("index-*.js"))
    assert bundles, (
        f"No Vite bundle found in {assets_dir}; run `npm run build` in chat-ui/web"
    )
    bundle_text = bundles[0].read_text(errors="replace")
    assert "dashboard" in bundle_text, (
        "Vite bundle must contain 'dashboard' URL-param handling"
    )
    assert '"open"' in bundle_text or "'open'" in bundle_text or "`open`" in bundle_text, (
        "Vite bundle must check for param value 'open'"
    )
