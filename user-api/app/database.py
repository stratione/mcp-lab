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
    # Seed default users if table is empty
    count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    if count == 0:
        conn.executemany(
            "INSERT INTO users (username, email, full_name, role) VALUES (?, ?, ?, ?)",
            SEED_USERS,
        )
    conn.commit()
    conn.close()
