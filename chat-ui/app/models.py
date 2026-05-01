from pydantic import BaseModel
from typing import Optional


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []


class ProviderConfig(BaseModel):
    provider: str  # "ollama", "openai", "anthropic", "google"
    api_key: Optional[str] = None
    model: Optional[str] = None
    base_url: Optional[str] = None


class ToolCall(BaseModel):
    name: str
    arguments: dict
    result: Optional[str] = None


class TokenUsage(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0



class ConfidenceResult(BaseModel):
    score: float = 0.0  # 0.0 to 1.0
    label: str = "Unknown"  # "Low", "Medium", "High", "Verified", "Hallucination"
    source: str = "heuristic"  # "heuristic" or "llm"
    details: str = ""


class ChatResponse(BaseModel):
    reply: str
    tool_calls: list[ToolCall] = []
    token_usage: TokenUsage = TokenUsage()
    confidence: ConfidenceResult = ConfidenceResult()
    hallucination_mode: bool = False


class VerifyRequest(BaseModel):
    reply: str
    tool_calls: list[ToolCall] = []


class VerifyResponse(BaseModel):
    confidence: ConfidenceResult
    token_usage: TokenUsage = TokenUsage()


# ─── /api/chat-compare (M5 — BYOK side-by-side) ───

class PaneConfig(BaseModel):
    provider: str
    model: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None


class CompareRequest(BaseModel):
    message: str
    left: PaneConfig
    right: PaneConfig


class PaneResult(BaseModel):
    reply: str = ""
    tool_calls: list[ToolCall] = []
    token_usage: TokenUsage = TokenUsage()
    elapsed_ms: int = 0
    error: Optional[str] = None
    provider: str = ""
    model: str = ""


class CompareResponse(BaseModel):
    left: PaneResult
    right: PaneResult
