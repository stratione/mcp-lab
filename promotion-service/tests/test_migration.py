"""init_db must upgrade a v1 volume additively without breaking old rows."""
import sqlite3

from app import promote


V1_SCHEMA = """
    CREATE TABLE promotions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        image_name TEXT NOT NULL,
        tag TEXT NOT NULL,
        promoted_by TEXT NOT NULL,
        source_registry TEXT NOT NULL,
        target_registry TEXT NOT NULL,
        digest TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        policy_check TEXT NOT NULL DEFAULT 'pending',
        promoted_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
"""


def make_v1_db(path):
    conn = sqlite3.connect(path)
    conn.execute(V1_SCHEMA)
    conn.execute(
        "INSERT INTO promotions (image_name, tag, promoted_by, source_registry, target_registry, digest, status, policy_check) "
        "VALUES ('hello-app', 'latest', 'admin', 'http://registry-dev:5000', 'http://registry-prod:5000', 'sha256:abc', 'success', 'skipped — success')"
    )
    conn.commit()
    conn.close()


def test_init_db_migrates_v1_volume(tmp_path, monkeypatch):
    db_path = str(tmp_path / "old.db")
    make_v1_db(db_path)
    monkeypatch.setattr(promote, "DB_PATH", db_path)

    promote.init_db()
    promote.init_db()  # idempotent

    conn = sqlite3.connect(db_path)
    cols = {r[1] for r in conn.execute("PRAGMA table_info(promotions)")}
    assert {"from_registry", "to_registry", "action", "detail"} <= cols
    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert "scans" in tables
    # Old row survived and got the action backfill from the column default.
    row = conn.execute("SELECT action, digest FROM promotions WHERE id = 1").fetchone()
    assert row == ("promote", "sha256:abc")
    conn.close()


async def test_v1_rows_serialize_through_api(tmp_path, monkeypatch):
    import httpx
    from app.main import app

    db_path = str(tmp_path / "old.db")
    make_v1_db(db_path)
    monkeypatch.setattr(promote, "DB_PATH", db_path)
    for var in ("DEV_REGISTRY_URL", "STAGING_REGISTRY_URL", "PROD_REGISTRY_URL"):
        monkeypatch.delenv(var, raising=False)
    promote.init_db()

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/promotions/1")
    assert resp.status_code == 200
    body = resp.json()
    # from/to names derived from the stored v1 URLs
    assert body["from_registry"] == "dev"
    assert body["to_registry"] == "prod"
    assert body["action"] == "promote"
    assert body["detail"] == "skipped — success"  # falls back to policy_check
    assert body["created_at"] == body["promoted_at"]
