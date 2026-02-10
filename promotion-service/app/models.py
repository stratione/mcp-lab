from pydantic import BaseModel
from typing import Optional


class PromoteRequest(BaseModel):
    image_name: str
    tag: str
    promoted_by: str  # username


class PromotionResponse(BaseModel):
    id: int
    image_name: str
    tag: str
    promoted_by: str
    source_registry: str
    target_registry: str
    digest: Optional[str] = None
    status: str
    policy_check: str
    promoted_at: str
