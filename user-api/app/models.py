import re
from pydantic import BaseModel, field_validator
from typing import Optional

VALID_ROLES = ("admin", "dev", "viewer")

ROLE_DESCRIPTIONS = {
    "admin": "Full access — can manage users, repos, and promotions",
    "dev":   "Developer access — can push images and create repos",
    "viewer": "Read-only access — can view resources but not modify them",
}
USERNAME_RE = re.compile(r"^[a-zA-Z0-9_]{2,30}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class UserCreate(BaseModel):
    username: str
    email: str
    full_name: str
    role: str

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        if not USERNAME_RE.match(v):
            raise ValueError("Username must be 2-30 characters, alphanumeric and underscores only")
        return v

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        if not EMAIL_RE.match(v):
            raise ValueError("Invalid email format")
        return v

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Full name cannot be empty")
        return v

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        if v not in VALID_ROLES:
            raise ValueError(f"Role must be one of: {', '.join(VALID_ROLES)}")
        return v


class UserUpdate(BaseModel):
    email: Optional[str] = None
    full_name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str | None) -> str | None:
        if v is not None and not EMAIL_RE.match(v):
            raise ValueError("Invalid email format")
        return v

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, v: str | None) -> str | None:
        if v is not None:
            v = v.strip()
            if not v:
                raise ValueError("Full name cannot be empty")
        return v

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str | None) -> str | None:
        if v is not None and v not in VALID_ROLES:
            raise ValueError(f"Role must be one of: {', '.join(VALID_ROLES)}")
        return v


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    full_name: str
    role: str
    is_active: bool
    created_at: str
    updated_at: str
