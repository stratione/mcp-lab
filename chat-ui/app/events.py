"""Pipeline event store — a small persisted ring buffer behind the
Pipeline Board's live event feed.

Events arrive from many directions (Gitea webhooks, the CI runner's
curl step, scan/promotion/deploy MCP tools, manual posts from labctl)
and the board only ever needs "the recent ones, newest first", so a
capped JSON file is plenty: no database, survives container restarts
via the existing CHAT_DATA_DIR volume, and self-heals if the file is
missing or corrupt.

Records have the shape:

    {"id": 7, "received_at": "...Z", "source": "gitea",
     "type": "push", "summary": "...", "detail": "..."}

Writes are guarded by an asyncio.Lock and persisted atomically
(temp file + os.replace) so a crash mid-write can never corrupt the
previous snapshot.
"""

import asyncio
import json
import logging
import os
import pathlib
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# Sources accepted by POST /api/events. Free-form `type` within a source
# is fine (e.g. "ci.success", "scan.failed"); the source is the trust
# boundary the UI groups/colours by, so it stays a closed set.
VALID_EVENT_SOURCES = {"gitea", "runner", "scan", "promotion", "deploy", "manual"}

# Ring-buffer capacity — oldest events fall off the end.
EVENTS_CAP = 500

# Keep individual detail blobs bounded so 500 webhook payloads can't
# balloon the JSON file (or the /api/pipeline/state response).
_DETAIL_MAX_CHARS = 4000


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


class EventStore:
    """Capped, persisted, newest-last list of events with monotonic ids."""

    def __init__(self, path: pathlib.Path, cap: int = EVENTS_CAP):
        self.path = pathlib.Path(path)
        self.cap = cap
        self._lock = asyncio.Lock()
        self._events: list[dict] | None = None  # lazy-loaded under the lock

    # ── persistence ──────────────────────────────────────────────────

    def _load(self) -> list[dict]:
        """Read events from disk. Missing/corrupt/wrong-shape files all
        degrade to an empty store — the feed is observability, never
        worth failing a request over."""
        try:
            raw = json.loads(self.path.read_text())
        except FileNotFoundError:
            return []
        except Exception as e:
            logger.warning("event store %s unreadable (%s) — starting fresh", self.path, e)
            return []
        if not isinstance(raw, list):
            logger.warning("event store %s has unexpected shape — starting fresh", self.path)
            return []
        return [e for e in raw if isinstance(e, dict) and isinstance(e.get("id"), int)]

    def _save(self, events: list[dict]) -> None:
        """Atomic write: temp file in the same directory, then rename."""
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_name(self.path.name + ".tmp")
        tmp.write_text(json.dumps(events))
        os.replace(tmp, self.path)

    def _ensure_loaded(self) -> list[dict]:
        if self._events is None:
            self._events = self._load()
        return self._events

    # ── public API ───────────────────────────────────────────────────

    async def append(self, source: str, type: str, summary: str, detail: str = "") -> dict:
        """Append one event, enforce the cap, persist, return the record."""
        async with self._lock:
            events = self._ensure_loaded()
            next_id = (max((e["id"] for e in events), default=0)) + 1
            record = {
                "id": next_id,
                "received_at": _utcnow(),
                "source": str(source),
                "type": str(type),
                "summary": str(summary),
                "detail": str(detail or "")[:_DETAIL_MAX_CHARS],
            }
            events.append(record)
            if len(events) > self.cap:
                del events[: len(events) - self.cap]
            self._save(events)
            return record

    async def list(self, limit: int = 50) -> list[dict]:
        """Newest first. `limit` is clamped to [1, cap]."""
        limit = max(1, min(int(limit), self.cap))
        async with self._lock:
            events = self._ensure_loaded()
            return list(reversed(events[-limit:]))


# ── Gitea webhook normalization ───────────────────────────────────────


def _short_sha(sha: str) -> str:
    return (sha or "")[:7]


def normalize_gitea_event(payload, event_header: str) -> tuple[str, str, str]:
    """Turn a raw Gitea webhook payload into (type, summary, detail).

    Never raises — webhooks must always be acknowledged with a 200 no
    matter what Gitea (or a curious student with curl) sends. Unknown
    event types are stored verbatim under the header's name so nothing
    silently disappears from the feed.
    """
    event = (event_header or "").strip() or "unknown"
    if not isinstance(payload, dict):
        return event, f"unparseable gitea webhook ({event})", ""

    repo = ""
    repository = payload.get("repository")
    if isinstance(repository, dict):
        repo = str(repository.get("full_name") or repository.get("name") or "")
    repo = repo or "unknown-repo"

    detail = json.dumps(payload)[:_DETAIL_MAX_CHARS]

    try:
        if event == "push":
            head = payload.get("head_commit") or {}
            if not isinstance(head, dict):
                head = {}
            sha = str(head.get("id") or payload.get("after") or "")
            message = str(head.get("message") or "").splitlines()
            first_line = message[0] if message else ""
            summary = f"push to {repo}: {_short_sha(sha)} {first_line}".rstrip()
            return "push", summary, detail
        if event in ("create", "delete"):
            ref_type = str(payload.get("ref_type") or "ref")
            ref = str(payload.get("ref") or "")
            verb = "created" if event == "create" else "deleted"
            summary = f"{ref_type} {ref} {verb} in {repo}".replace("  ", " ")
            return event, summary, detail
    except Exception as e:  # defense-in-depth: weird payload shapes
        logger.info("gitea webhook normalization fell back (%s): %s", event, e)

    return event, f"{event} event on {repo}", detail
