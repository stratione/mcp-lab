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


class VerifyRequest(BaseModel):
    reply: str
    tool_calls: list[ToolCall] = []


class VerifyResponse(BaseModel):
    confidence: ConfidenceResult
    token_usage: TokenUsage = TokenUsage()
