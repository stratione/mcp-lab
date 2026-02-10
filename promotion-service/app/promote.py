import httpx
import os
import sqlite3

USER_API_URL = os.environ.get("USER_API_URL", "http://user-api:8001")
DEV_REGISTRY = os.environ.get("DEV_REGISTRY_URL", "http://registry-dev:5000")
PROD_REGISTRY = os.environ.get("PROD_REGISTRY_URL", "http://registry-prod:5000")
DB_PATH = os.environ.get("DB_PATH", "/app/data/promotions.db")


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
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
    conn.commit()
    conn.close()


async def check_policy(username: str) -> tuple[bool, str]:
    """Verify user exists and has reviewer or admin role."""
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(f"{USER_API_URL}/users/by-username/{username}", timeout=10.0)
            if resp.status_code == 404:
                return False, f"User '{username}' not found"
            resp.raise_for_status()
            user = resp.json()
            if not user.get("is_active"):
                return False, f"User '{username}' is deactivated"
            if user.get("role") not in ("reviewer", "admin"):
                return False, f"User '{username}' has role '{user.get('role')}' — must be reviewer or admin"
            return True, "passed"
        except httpx.HTTPStatusError as e:
            return False, f"User API error: {e.response.status_code}"
        except httpx.ConnectError:
            return False, "User API unreachable"


async def copy_image(image_name: str, tag: str) -> tuple[bool, str, str]:
    """Copy image manifest and blobs from dev to prod registry using Registry v2 API."""
    async with httpx.AsyncClient() as client:
        # Get manifest from dev
        manifest_url = f"{DEV_REGISTRY}/v2/{image_name}/manifests/{tag}"
        headers = {
            "Accept": "application/vnd.docker.distribution.manifest.v2+json, "
                      "application/vnd.oci.image.manifest.v1+json, "
                      "application/vnd.docker.distribution.manifest.list.v2+json"
        }
        try:
            resp = await client.get(manifest_url, headers=headers, timeout=30.0)
            if resp.status_code == 404:
                return False, "", f"Image {image_name}:{tag} not found in dev registry"
            resp.raise_for_status()
        except httpx.ConnectError:
            return False, "", "Dev registry unreachable"

        manifest_content = resp.content
        manifest_content_type = resp.headers.get("content-type", headers["Accept"].split(",")[0].strip())
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
            blob_url = f"{DEV_REGISTRY}/v2/{image_name}/blobs/{blob_digest}"
            try:
                blob_resp = await client.get(blob_url, timeout=60.0)
                blob_resp.raise_for_status()
            except Exception as e:
                return False, digest, f"Failed to fetch blob {blob_digest}: {e}"

            # Push blob to prod: start upload, then push
            upload_url = f"{PROD_REGISTRY}/v2/{image_name}/blobs/uploads/"
            try:
                upload_resp = await client.post(upload_url, timeout=30.0)
                upload_resp.raise_for_status()
                location = upload_resp.headers.get("location", "")
                if not location.startswith("http"):
                    location = f"{PROD_REGISTRY}{location}"

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
                        f"{PROD_REGISTRY}/v2/{image_name}/blobs/{blob_digest}", timeout=10.0
                    )
                    if check.status_code != 200:
                        return False, digest, f"Failed to push blob {blob_digest}: {put_resp.status_code}"
            except Exception as e:
                return False, digest, f"Failed to push blob {blob_digest}: {e}"

        # Push manifest to prod
        put_manifest_url = f"{PROD_REGISTRY}/v2/{image_name}/manifests/{tag}"
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


async def promote_image(image_name: str, tag: str, promoted_by: str) -> dict:
    """Full promotion flow: policy check then copy."""
    db = get_db()

    # Policy check
    policy_ok, policy_msg = await check_policy(promoted_by)
    if not policy_ok:
        cursor = db.execute(
            "INSERT INTO promotions (image_name, tag, promoted_by, source_registry, target_registry, status, policy_check) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (image_name, tag, promoted_by, DEV_REGISTRY, PROD_REGISTRY, "rejected", policy_msg),
        )
        db.commit()
        row = db.execute("SELECT * FROM promotions WHERE id = ?", (cursor.lastrowid,)).fetchone()
        result = dict(row)
        db.close()
        return result

    # Copy image
    success, digest, msg = await copy_image(image_name, tag)
    status = "success" if success else "failed"
    cursor = db.execute(
        "INSERT INTO promotions (image_name, tag, promoted_by, source_registry, target_registry, digest, status, policy_check) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (image_name, tag, promoted_by, DEV_REGISTRY, PROD_REGISTRY, digest, status, f"passed — {msg}" if success else msg),
    )
    db.commit()
    row = db.execute("SELECT * FROM promotions WHERE id = ?", (cursor.lastrowid,)).fetchone()
    result = dict(row)
    db.close()
    return result
