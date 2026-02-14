import sqlite3
import os

DB_PATH = os.environ.get("DB_PATH", "/app/data/users.db")


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


SEED_USERS = [
    ("alice", "alice@example.com", "Alice Johnson", "admin"),
    ("bob", "bob@example.com", "Bob Smith", "dev"),
    ("charlie", "charlie@example.com", "Charlie Davis", "dev"),
    ("diana", "diana@example.com", "Diana Lee", "viewer"),
    ("eve", "eve@example.com", "Eve Martinez", "admin"),
    ("system", "system@mcp-lab.local", "System Automation", "admin"),
]


def init_db():
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT NOT NULL,
            full_name TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'dev',
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    # Seed default users (idempotent)
    for user in SEED_USERS:
        # Check if user exists by username to avoid unique constraint errors if using generic INSERT
        # OR just use INSERT OR IGNORE since username is UNIQUE
        conn.execute(
            "INSERT OR IGNORE INTO users (username, email, full_name, role) VALUES (?, ?, ?, ?)",
            user,
        )
    conn.commit()
    conn.close()
