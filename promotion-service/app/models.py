from pydantic import BaseModel
from typing import Literal, Optional

RegistryName = Literal["dev", "staging", "prod"]


class PromoteRequest(BaseModel):
    image_name: str
    tag: str
    promoted_by: str  # username — audit metadata only, no role gate
    from_registry: RegistryName = "dev"
    to_registry: RegistryName = "prod"


class PromotionResponse(BaseModel):
    id: int
    image_name: str
    tag: str
    promoted_by: str
    from_registry: str
    to_registry: str
    digest: Optional[str] = None
    status: str
    detail: Optional[str] = None
    action: str = "promote"
    created_at: str
    # v1 fields kept for back-compat with existing consumers
    source_registry: Optional[str] = None
    target_registry: Optional[str] = None
    policy_check: Optional[str] = None
    promoted_at: Optional[str] = None


class RollbackRequest(BaseModel):
    image_name: str
    tag: str = "latest"
    environment: Literal["staging", "prod"]
    rolled_back_by: str


class ScanCreateRequest(BaseModel):
    image_name: str
    tag: str
    registry: RegistryName
    scanned_by: str
    critical: int = 0
    high: int = 0
    medium: int = 0
    low: int = 0
    total: int = 0
    passed: bool = False  # ignored — recomputed server-side from critical vs PROMOTION_MAX_CRITICAL
    report: str = ""  # JSON string, truncated to 200 KB server-side


class ScanSummary(BaseModel):
    id: int
    image_name: str
    tag: str
    registry: str
    scanned_by: str
    critical: int
    high: int
    medium: int
    low: int
    total: int
    passed: bool
    created_at: str


class ScanResponse(ScanSummary):
    report: Optional[str] = None


class PolicyResponse(BaseModel):
    flow: str
    require_scan: bool
    max_critical: int
    legal_promotions: list[list[str]]
