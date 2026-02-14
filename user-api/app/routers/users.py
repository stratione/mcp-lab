from fastapi import APIRouter, HTTPException, Query, Response
from ..models import UserCreate, UserUpdate, UserResponse, VALID_ROLES, ROLE_DESCRIPTIONS
from ..database import get_db

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/roles")
def list_roles():
    """Return all valid roles and their descriptions."""
    return [
        {"role": role, "description": ROLE_DESCRIPTIONS[role]}
        for role in VALID_ROLES
    ]


def _row_to_dict(row) -> dict:
    return {
        "id": row["id"],
        "username": row["username"],
        "email": row["email"],
        "full_name": row["full_name"],
        "role": row["role"],
        "is_active": bool(row["is_active"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


@router.post("", response_model=UserResponse, status_code=201)
def create_user(user: UserCreate):
    db = get_db()
    try:
        cursor = db.execute(
            "INSERT INTO users (username, email, full_name, role) VALUES (?, ?, ?, ?)",
            (user.username, user.email, user.full_name, user.role),
        )
        db.commit()
        row = db.execute("SELECT * FROM users WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return _row_to_dict(row)
    except Exception as e:
        if "UNIQUE constraint" in str(e):
            raise HTTPException(status_code=409, detail=f"Username '{user.username}' already exists")
        raise
    finally:
        db.close()


@router.get("", response_model=list[UserResponse])
def list_users(
    response: Response,
    role: str | None = None,
    is_active: bool | None = None,
    search: str | None = None,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    db = get_db()
    conditions = []
    params: list = []

    if role is not None:
        conditions.append("role = ?")
        params.append(role)
    if is_active is not None:
        conditions.append("is_active = ?")
        params.append(int(is_active))
    if search:
        conditions.append("(username LIKE ? OR email LIKE ? OR full_name LIKE ?)")
        like = f"%{search}%"
        params.extend([like, like, like])

    where = f" WHERE {' AND '.join(conditions)}" if conditions else ""

    count_row = db.execute(f"SELECT COUNT(*) FROM users{where}", params).fetchone()
    total = count_row[0]
    response.headers["X-Total-Count"] = str(total)

    rows = db.execute(
        f"SELECT * FROM users{where} ORDER BY id LIMIT ? OFFSET ?",
        params + [limit, offset],
    ).fetchall()
    db.close()
    return [_row_to_dict(r) for r in rows]


@router.get("/{user_id}", response_model=UserResponse)
def get_user(user_id: int):
    db = get_db()
    row = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    db.close()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return _row_to_dict(row)


@router.get("/by-username/{username}", response_model=UserResponse)
def get_user_by_username(username: str):
    db = get_db()
    row = db.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    db.close()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return _row_to_dict(row)


@router.put("/{user_id}", response_model=UserResponse)
def update_user(user_id: int, user: UserUpdate):
    db = get_db()
    existing = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if not existing:
        db.close()
        raise HTTPException(status_code=404, detail="User not found")

    updates = {}
    if user.email is not None:
        updates["email"] = user.email
    if user.full_name is not None:
        updates["full_name"] = user.full_name
    if user.role is not None:
        updates["role"] = user.role
    if user.is_active is not None:
        updates["is_active"] = int(user.is_active)

    if updates:
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        set_clause += ", updated_at = datetime('now')"
        values = list(updates.values()) + [user_id]
        db.execute(f"UPDATE users SET {set_clause} WHERE id = ?", values)
        db.commit()

    row = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    db.close()
    return _row_to_dict(row)


@router.delete("/{user_id}", status_code=204)
def delete_user(user_id: int):
    db = get_db()
    existing = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if not existing:
        db.close()
        raise HTTPException(status_code=404, detail="User not found")
    db.execute("DELETE FROM users WHERE id = ?", (user_id,))
    db.commit()
    db.close()
