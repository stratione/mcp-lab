import httpx
import os
import sqlite3

USER_API_URL = os.environ.get("USER_API_URL", "http://user-api:8001")
DB_PATH = os.environ.get("DB_PATH", "/app/data/promotions.db")

# Accept both single-manifest and manifest-list (multi-arch) media types,
# docker and OCI flavors — the registry echoes back whichever it stores.
MANIFEST_ACCEPT = (
    "application/vnd.docker.distribution.manifest.v2+json, "
    "application/vnd.oci.image.manifest.v1+json, "
    "application/vnd.docker.distribution.manifest.list.v2+json, "
    "application/vnd.oci.image.index.v1+json"
)

# /scans `report` payloads are capped so a full Trivy JSON dump can't bloat
# the SQLite file or the API responses.
REPORT_CAP = 200 * 1024


class PromotionBlocked(Exception):
    """A policy gate (flow or scan) refused the promotion — surfaces as 409."""


def get_registries() -> dict[str, str]:
    """Registry name → base URL map, read at call time so env overrides apply per request."""
    return {
        "dev": os.environ.get("DEV_REGISTRY_URL", "http://registry-dev:5000"),
        "staging": os.environ.get("STAGING_REGISTRY_URL", "http://registry-staging:5000"),
        "prod": os.environ.get("PROD_REGISTRY_URL", "http://registry-prod:5000"),
    }


def get_policy() -> dict:
    """Promotion policy from env, read at call time.

    Code defaults preserve v1 behavior (two-stage dev→prod, no scan gate);
    compose sets PROMOTION_FLOW=three-stage and PROMOTION_REQUIRE_SCAN=true.
    Any flow value other than "three-stage" is treated as two-stage.
    """
    flow = os.environ.get("PROMOTION_FLOW", "two-stage")
    require_scan = os.environ.get("PROMOTION_REQUIRE_SCAN", "false").strip().lower() in ("1", "true", "yes")
    try:
        max_critical = int(os.environ.get("PROMOTION_MAX_CRITICAL", "0"))
    except ValueError:
        max_critical = 0
    if flow == "three-stage":
        legal = [["dev", "staging"], ["staging", "prod"]]
    else:
        legal = [["dev", "prod"]]
    return {
        "flow": flow,
        "require_scan": require_scan,
        "max_critical": max_critical,
        "legal_promotions": legal,
    }


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def _columns(conn: sqlite3.Connection, table: str) -> set:
    return {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}


def init_db():
    """Create/upgrade the schema. Additive only — existing volumes must survive."""
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS promotions (
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
    """)
    # v2 columns, guarded so re-running init_db on an old volume is a no-op.
    existing = _columns(conn, "promotions")
    for column, ddl in (
        ("from_registry", "ALTER TABLE promotions ADD COLUMN from_registry TEXT"),
        ("to_registry", "ALTER TABLE promotions ADD COLUMN to_registry TEXT"),
        ("action", "ALTER TABLE promotions ADD COLUMN action TEXT NOT NULL DEFAULT 'promote'"),
        ("detail", "ALTER TABLE promotions ADD COLUMN detail TEXT"),
    ):
        if column not in existing:
            conn.execute(ddl)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS scans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            image_name TEXT NOT NULL,
            tag TEXT NOT NULL,
            registry TEXT NOT NULL,
            scanned_by TEXT NOT NULL,
            critical INTEGER NOT NULL DEFAULT 0,
            high INTEGER NOT NULL DEFAULT 0,
            medium INTEGER NOT NULL DEFAULT 0,
            low INTEGER NOT NULL DEFAULT 0,
            total INTEGER NOT NULL DEFAULT 0,
            passed INTEGER NOT NULL DEFAULT 0,
            report TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    conn.commit()
    conn.close()


def row_to_promotion(row: sqlite3.Row) -> dict:
    """Normalize a promotions row to the v2 response shape.

    Rows written before v2 lack from/to names, action and detail — derive
    them (legacy rows were always dev→prod promote) so old volumes still
    serialize cleanly.
    """
    d = dict(row)
    url_to_name = {url: name for name, url in get_registries().items()}
    if not d.get("from_registry"):
        d["from_registry"] = url_to_name.get(d.get("source_registry"), "dev")
    if not d.get("to_registry"):
        d["to_registry"] = url_to_name.get(d.get("target_registry"), "prod")
    if not d.get("action"):
        d["action"] = "promote"
    if d.get("detail") is None:
        d["detail"] = d.get("policy_check")
    d["created_at"] = d.get("promoted_at")
    return d


def row_to_scan(row: sqlite3.Row) -> dict:
    d = dict(row)
    d["passed"] = bool(d["passed"])
    return d


def latest_scan(db: sqlite3.Connection, image_name: str, tag: str, registry: str):
    return db.execute(
        "SELECT * FROM scans WHERE image_name = ? AND tag = ? AND registry = ? ORDER BY id DESC LIMIT 1",
        (image_name, tag, registry),
    ).fetchone()


def record_scan(image_name: str, tag: str, registry: str, scanned_by: str,
                critical: int, high: int, medium: int, low: int, total: int,
                report: str) -> dict:
    """Store a scan verdict. `passed` is always computed server-side."""
    passed = critical <= get_policy()["max_critical"]
    if report and len(report) > REPORT_CAP:
        report = report[:REPORT_CAP]
    db = get_db()
    cursor = db.execute(
        "INSERT INTO scans (image_name, tag, registry, scanned_by, critical, high, medium, low, total, passed, report) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (image_name, tag, registry, scanned_by, critical, high, medium, low, total,
         1 if passed else 0, report),
    )
    db.commit()
    row = db.execute("SELECT * FROM scans WHERE id = ?", (cursor.lastrowid,)).fetchone()
    db.close()
    return row_to_scan(row)


async def check_policy(username: str) -> tuple[bool, str]:
    """Verify user exists and has admin role."""
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(f"{USER_API_URL}/users/by-username/{username}", timeout=10.0)
            if resp.status_code == 404:
                return False, f"User '{username}' not found"
            resp.raise_for_status()
            user = resp.json()
            if not user.get("is_active"):
                return False, f"User '{username}' is deactivated"
            if user.get("role") != "admin":
                return False, f"User '{username}' has role '{user.get('role')}' — must be admin"
            return True, "passed"
        except httpx.HTTPStatusError as e:
            return False, f"User API error: {e.response.status_code}"
        except httpx.ConnectError:
            return False, "User API unreachable"


async def copy_image(image_name: str, tag: str, from_registry: str, to_registry: str) -> tuple[bool, str, str]:
    """Copy image manifest and blobs between registries using the Registry v2 API."""
    registries = get_registries()
    source = registries[from_registry]
    target = registries[to_registry]
    async with httpx.AsyncClient() as client:
        # Get manifest from source
        manifest_url = f"{source}/v2/{image_name}/manifests/{tag}"
        headers = {"Accept": MANIFEST_ACCEPT}
        try:
            resp = await client.get(manifest_url, headers=headers, timeout=30.0)
            if resp.status_code == 404:
                return False, "", f"Image {image_name}:{tag} not found in {from_registry} registry"
            resp.raise_for_status()
        except httpx.ConnectError:
            return False, "", f"{from_registry} registry unreachable"

        manifest_content = resp.content
        manifest_content_type = resp.headers.get("content-type", MANIFEST_ACCEPT.split(",")[0].strip())
        digest = resp.headers.get("docker-content-digest", "")

        # Parse manifest for blob references
        try:
            manifest_json = resp.json()
            blob_digests = []
            if "config" in manifest_json:
                blob_digests.append(manifest_json["config"]["digest"])
            for layer in manifest_json.get("layers", []):
                blob_digests.append(layer["digest"])
        except Exception:
            blob_digests = []

        # Copy blobs
        for blob_digest in blob_digests:
            blob_url = f"{source}/v2/{image_name}/blobs/{blob_digest}"
            try:
                blob_resp = await client.get(blob_url, timeout=60.0)
                blob_resp.raise_for_status()
            except Exception as e:
                return False, digest, f"Failed to fetch blob {blob_digest}: {e}"

            # Push blob to target: start upload, then push
            upload_url = f"{target}/v2/{image_name}/blobs/uploads/"
            try:
                upload_resp = await client.post(upload_url, timeout=30.0)
                upload_resp.raise_for_status()
                location = upload_resp.headers.get("location", "")
                if not location.startswith("http"):
                    location = f"{target}{location}"

                sep = "&" if "?" in location else "?"
                put_url = f"{location}{sep}digest={blob_digest}"
                put_resp = await client.put(
                    put_url,
                    content=blob_resp.content,
                    headers={"Content-Type": "application/octet-stream"},
                    timeout=60.0,
                )
                if put_resp.status_code not in (201, 202):
                    # Blob may already exist — check
                    check = await client.head(
                        f"{target}/v2/{image_name}/blobs/{blob_digest}", timeout=10.0
                    )
                    if check.status_code != 200:
                        return False, digest, f"Failed to push blob {blob_digest}: {put_resp.status_code}"
            except Exception as e:
                return False, digest, f"Failed to push blob {blob_digest}: {e}"

        # Push manifest to target
        put_manifest_url = f"{target}/v2/{image_name}/manifests/{tag}"
        try:
            put_resp = await client.put(
                put_manifest_url,
                content=manifest_content,
                headers={"Content-Type": manifest_content_type},
                timeout=30.0,
            )
            if put_resp.status_code not in (201, 202):
                return False, digest, f"Failed to push manifest: {put_resp.status_code}"
        except Exception as e:
            return False, digest, f"Failed to push manifest: {e}"

        return True, digest, "success"


async def repoint_tag(image_name: str, tag: str, registry_name: str, digest: str) -> tuple[bool, str]:
    """Re-point `tag` at an existing manifest digest WITHIN one registry.

    Registries are content-addressed: every manifest a registry has ever
    accepted stays fetchable by digest (and its blobs with it) until garbage-
    collected. Rollback therefore never needs a cross-registry copy — we GET
    the previous promotion's manifest by digest from the target registry
    itself and PUT it back under the tag.
    """
    registry = get_registries()[registry_name]
    async with httpx.AsyncClient() as client:
        manifest_url = f"{registry}/v2/{image_name}/manifests/{digest}"
        try:
            resp = await client.get(manifest_url, headers={"Accept": MANIFEST_ACCEPT}, timeout=30.0)
            if resp.status_code == 404:
                return False, (f"Manifest {digest} no longer present in {registry_name} registry "
                               "(garbage-collected?)")
            resp.raise_for_status()
        except httpx.ConnectError:
            return False, f"{registry_name} registry unreachable"
        except httpx.HTTPError as e:
            return False, f"Failed to fetch manifest {digest}: {e}"

        content_type = resp.headers.get("content-type", MANIFEST_ACCEPT.split(",")[0].strip())
        put_url = f"{registry}/v2/{image_name}/manifests/{tag}"
        try:
            put_resp = await client.put(
                put_url,
                content=resp.content,
                headers={"Content-Type": content_type},
                timeout=30.0,
            )
            if put_resp.status_code not in (201, 202):
                return False, f"Failed to push manifest: {put_resp.status_code}"
        except Exception as e:
            return False, f"Failed to push manifest: {e}"

        return True, "success"


async def promote_image(image_name: str, tag: str, promoted_by: str,
                        from_registry: str = "dev", to_registry: str = "prod") -> dict:
    """Full promotion flow: policy gates, copy source → target, write audit row.

    Gates (both raise PromotionBlocked → 409, no audit row for a refused request):
    - flow: [from, to] must be one of get_policy()["legal_promotions"].
    - scan (only when PROMOTION_REQUIRE_SCAN): the most recent scan for
      (image_name, tag, from_registry) must exist and have passed.

    The v1 role-gated policy check (`check_policy`) was removed at workshop
    request — every `promoted_by` is accepted so the demo flow doesn't snag
    on the model picking a username the seed doesn't have. The `policy_check`
    column is still recorded as audit metadata; `check_policy` remains in the
    file in case the gate is ever reintroduced.
    """
    policy = get_policy()
    if [from_registry, to_registry] not in policy["legal_promotions"]:
        legal = ", ".join("→".join(pair) for pair in policy["legal_promotions"])
        raise PromotionBlocked(
            f"blocked by policy: {from_registry}→{to_registry} is not a legal promotion "
            f"under the {policy['flow']} flow (legal: {legal})"
        )

    db = get_db()
    try:
        if policy["require_scan"]:
            scan = latest_scan(db, image_name, tag, from_registry)
            if scan is None:
                raise PromotionBlocked(
                    f"blocked by policy: no passing scan for {image_name}:{tag} in {from_registry} "
                    "(no scan recorded — scan the image first)"
                )
            if not scan["passed"]:
                raise PromotionBlocked(
                    f"blocked by policy: no passing scan for {image_name}:{tag} in {from_registry} "
                    f"(latest scan #{scan['id']} failed: critical={scan['critical']}, "
                    f"max allowed {policy['max_critical']})"
                )

        registries = get_registries()
        success, digest, msg = await copy_image(image_name, tag, from_registry, to_registry)
        status = "success" if success else "failed"
        cursor = db.execute(
            "INSERT INTO promotions (image_name, tag, promoted_by, source_registry, target_registry, "
            "digest, status, policy_check, from_registry, to_registry, action, detail) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (image_name, tag, promoted_by, registries[from_registry], registries[to_registry],
             digest, status, f"skipped — {msg}" if success else msg,
             from_registry, to_registry, "promote", msg),
        )
        db.commit()
        row = db.execute("SELECT * FROM promotions WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return row_to_promotion(row)
    finally:
        db.close()


async def rollback_image(image_name: str, tag: str, environment: str, rolled_back_by: str):
    """Roll `environment`'s tag back to the previous successful promotion.

    "Previous" = the second-most-recent successful promote-action row for
    (image_name, tag, environment): the most recent one is what the tag
    currently points at, so there must be at least two to have something to
    roll back to. Returns None when there isn't (→ 404). The re-point happens
    entirely inside the target registry (see `repoint_tag`); a failed re-point
    is still recorded as an audit row with status="failed", mirroring
    `promote_image`'s failure behavior.
    """
    registry_url = get_registries()[environment]
    db = get_db()
    try:
        rows = db.execute(
            "SELECT * FROM promotions WHERE image_name = ? AND tag = ? AND status = 'success' "
            "AND action = 'promote' "
            "AND (to_registry = ? OR (to_registry IS NULL AND target_registry = ?)) "
            "AND digest IS NOT NULL AND digest != '' "
            "ORDER BY id DESC LIMIT 2",
            (image_name, tag, environment, registry_url),
        ).fetchall()
        if len(rows) < 2:
            return None
        previous = rows[1]

        success, msg = await repoint_tag(image_name, tag, environment, previous["digest"])
        status = "success" if success else "failed"
        detail = (f"rolled back to digest {previous['digest']} (promotion #{previous['id']})"
                  if success else msg)
        cursor = db.execute(
            "INSERT INTO promotions (image_name, tag, promoted_by, source_registry, target_registry, "
            "digest, status, policy_check, from_registry, to_registry, action, detail) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (image_name, tag, rolled_back_by, registry_url, registry_url,
             previous["digest"], status, detail, environment, environment, "rollback", detail),
        )
        db.commit()
        row = db.execute("SELECT * FROM promotions WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return row_to_promotion(row)
    finally:
        db.close()
