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


class ChatResponse(BaseModel):
    reply: str
    tool_calls: list[ToolCall] = []
