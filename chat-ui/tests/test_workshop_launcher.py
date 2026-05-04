"""Workshop wizard contract tests.

The shell-based workshop launcher (`scripts/workshop.sh`) was removed —
participants now mirror the presenter step-by-step (preflight → setup →
open http://localhost:3001 and click the ◇ Walkthrough button). These
tests pin the API + UI contracts the wizard still depends on:

  - DELETE /api/chat-history clears persisted state.
  - The chat-ui source handles the `?dashboard=open` query param so the
    inspector deep-link still works.
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


def test_dashboard_query_param_handler_present_in_source():
    """Pin: the chat-ui source must contain logic for the `dashboard=open`
    URL param so the wizard can deep-link to the compare panel.

    Previously this test inspected the built Vite bundle, but the bundle
    now lives only inside the chat-ui Docker image (the `chat-ui/app/static`
    directory is gitignored and never exists on the host). Asserting against
    the source — which Vite copies verbatim — is more reliable and catches
    regressions even before a build.
    """
    from pathlib import Path
    REPO_ROOT = Path("/Users/noelorona/Desktop/repos/mcp-lab")
    src_dir = REPO_ROOT / "chat-ui/web/src"
    sources = list(src_dir.rglob("*.tsx")) + list(src_dir.rglob("*.ts"))
    assert sources, f"No TS sources found under {src_dir}"

    matched_dashboard = False
    matched_open = False
    for path in sources:
        text = path.read_text(errors="replace")
        if "'dashboard'" in text or '"dashboard"' in text or "`dashboard`" in text:
            matched_dashboard = True
            if "'open'" in text or '"open"' in text or "`open`" in text:
                matched_open = True
    assert matched_dashboard, "no source file references the 'dashboard' URL param"
    assert matched_open, (
        "no source file references the 'open' value alongside the dashboard param"
    )
