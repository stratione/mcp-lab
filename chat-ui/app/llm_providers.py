import json
import httpx
from abc import ABC, abstractmethod
from .mcp_client import (
    mcp_tools_to_openai_format,
    mcp_tools_to_anthropic_format,
    call_tool,
)


class LLMProvider(ABC):
    @abstractmethod
    async def chat(self, messages: list[dict], tools: list[dict]) -> dict:
        """Send messages with tool definitions. Returns {"reply": str, "tool_calls": [...]}."""
        ...


class OllamaProvider(LLMProvider):
    def __init__(self, base_url: str = "http://host.containers.internal:11434", model: str = "llama3.1"):
        self.base_url = base_url.rstrip("/")
        self.model = model

    async def chat(self, messages: list[dict], tools: list[dict]) -> dict:
        openai_tools = mcp_tools_to_openai_format(tools)
        tool_calls_made = []

        # Conversation loop — handle tool calls iteratively
        for _ in range(10):
            payload = {"model": self.model, "messages": messages, "stream": False}
            if openai_tools:
                payload["tools"] = openai_tools

            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    f"{self.base_url}/v1/chat/completions",
                    json=payload,
                    timeout=120.0,
                )
                resp.raise_for_status()
                data = resp.json()

            choice = data["choices"][0]
            msg = choice["message"]

            if msg.get("tool_calls"):
                messages.append(msg)
                for tc in msg["tool_calls"]:
                    fn = tc["function"]
                    args = json.loads(fn["arguments"]) if isinstance(fn["arguments"], str) else fn["arguments"]
                    result = await call_tool(fn["name"], args)
                    tool_calls_made.append({"name": fn["name"], "arguments": args, "result": result})
                    messages.append({"role": "tool", "tool_call_id": tc["id"], "content": result})
            else:
                return {"reply": msg.get("content", ""), "tool_calls": tool_calls_made}

        return {"reply": msg.get("content", "Max tool iterations reached."), "tool_calls": tool_calls_made}


class OpenAIProvider(LLMProvider):
    def __init__(self, api_key: str, model: str = "gpt-4o"):
        self.api_key = api_key
        self.model = model

    async def chat(self, messages: list[dict], tools: list[dict]) -> dict:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=self.api_key)
        openai_tools = mcp_tools_to_openai_format(tools)
        tool_calls_made = []

        for _ in range(10):
            kwargs = {"model": self.model, "messages": messages}
            if openai_tools:
                kwargs["tools"] = openai_tools

            response = await client.chat.completions.create(**kwargs)
            choice = response.choices[0]

            if choice.message.tool_calls:
                msg_dict = {"role": "assistant", "content": choice.message.content or "", "tool_calls": []}
                for tc in choice.message.tool_calls:
                    msg_dict["tool_calls"].append({
                        "id": tc.id,
                        "type": "function",
                        "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                    })
                    args = json.loads(tc.function.arguments)
                    result = await call_tool(tc.function.name, args)
                    tool_calls_made.append({"name": tc.function.name, "arguments": args, "result": result})
                    messages.append(msg_dict)
                    messages.append({"role": "tool", "tool_call_id": tc.id, "content": result})
            else:
                return {"reply": choice.message.content or "", "tool_calls": tool_calls_made}

        return {"reply": "Max tool iterations reached.", "tool_calls": tool_calls_made}


class AnthropicProvider(LLMProvider):
    def __init__(self, api_key: str, model: str = "claude-sonnet-4-5-20250929"):
        self.api_key = api_key
        self.model = model

    async def chat(self, messages: list[dict], tools: list[dict]) -> dict:
        import anthropic
        client = anthropic.AsyncAnthropic(api_key=self.api_key)
        anthropic_tools = mcp_tools_to_anthropic_format(tools)
        tool_calls_made = []

        # Convert from OpenAI message format to Anthropic format
        anthropic_messages = []
        system_text = ""
        for m in messages:
            if m["role"] == "system":
                system_text = m["content"]
            else:
                anthropic_messages.append({"role": m["role"], "content": m["content"]})

        for _ in range(10):
            kwargs = {"model": self.model, "max_tokens": 4096, "messages": anthropic_messages}
            if anthropic_tools:
                kwargs["tools"] = anthropic_tools
            if system_text:
                kwargs["system"] = system_text

            response = await client.messages.create(**kwargs)

            # Check for tool use
            tool_use_blocks = [b for b in response.content if b.type == "tool_use"]
            text_blocks = [b for b in response.content if b.type == "text"]

            if tool_use_blocks:
                # Add assistant message
                anthropic_messages.append({"role": "assistant", "content": response.content})

                # Process each tool call
                tool_results = []
                for tb in tool_use_blocks:
                    result = await call_tool(tb.name, tb.input)
                    tool_calls_made.append({"name": tb.name, "arguments": tb.input, "result": result})
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": tb.id,
                        "content": result,
                    })
                anthropic_messages.append({"role": "user", "content": tool_results})
            else:
                reply = " ".join(b.text for b in text_blocks) if text_blocks else ""
                return {"reply": reply, "tool_calls": tool_calls_made}

        return {"reply": "Max tool iterations reached.", "tool_calls": tool_calls_made}


class GoogleProvider(LLMProvider):
    def __init__(self, api_key: str, model: str = "gemini-2.0-flash"):
        self.api_key = api_key
        self.model = model

    async def chat(self, messages: list[dict], tools: list[dict]) -> dict:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=self.api_key)

        # Build function declarations
        function_declarations = []
        tool_map = {}
        for tool in tools:
            schema = tool.get("inputSchema", {"type": "object", "properties": {}})
            properties = {}
            for pname, pdef in schema.get("properties", {}).items():
                properties[pname] = types.Schema(
                    type=types.Type(pdef.get("type", "STRING").upper()),
                    description=pdef.get("description", ""),
                )
            func_decl = types.FunctionDeclaration(
                name=tool["name"],
                description=tool.get("description", ""),
                parameters=types.Schema(
                    type=types.Type.OBJECT,
                    properties=properties,
                    required=schema.get("required", []),
                ),
            )
            function_declarations.append(func_decl)
            tool_map[tool["name"]] = tool

        gemini_tools = [types.Tool(function_declarations=function_declarations)] if function_declarations else []

        # Build contents
        contents = []
        for m in messages:
            if m["role"] == "system":
                continue
            role = "user" if m["role"] == "user" else "model"
            contents.append(types.Content(role=role, parts=[types.Part.from_text(text=m["content"])]))

        tool_calls_made = []

        for _ in range(10):
            config = types.GenerateContentConfig(tools=gemini_tools) if gemini_tools else None
            response = client.models.generate_content(
                model=self.model,
                contents=contents,
                config=config,
            )

            # Check for function calls
            has_function_call = False
            if response.candidates and response.candidates[0].content:
                for part in response.candidates[0].content.parts:
                    if part.function_call:
                        has_function_call = True
                        fn_name = part.function_call.name
                        fn_args = dict(part.function_call.args) if part.function_call.args else {}
                        result = await call_tool(fn_name, fn_args)
                        tool_calls_made.append({"name": fn_name, "arguments": fn_args, "result": result})

                        # Add model response and function result
                        contents.append(response.candidates[0].content)
                        contents.append(types.Content(
                            role="user",
                            parts=[types.Part.from_function_response(
                                name=fn_name,
                                response={"result": result},
                            )],
                        ))
                        break  # Process one function call at a time

            if not has_function_call:
                reply = response.text if response.text else ""
                return {"reply": reply, "tool_calls": tool_calls_made}

        return {"reply": "Max tool iterations reached.", "tool_calls": tool_calls_made}


def get_provider(config: dict) -> LLMProvider:
    """Factory to create the right provider from config."""
    provider_type = config.get("provider", "ollama")
    if provider_type == "ollama":
        return OllamaProvider(
            base_url=config.get("base_url", "http://host.containers.internal:11434"),
            model=config.get("model", "llama3.1"),
        )
    elif provider_type == "openai":
        return OpenAIProvider(
            api_key=config.get("api_key", ""),
            model=config.get("model", "gpt-4o"),
        )
    elif provider_type == "anthropic":
        return AnthropicProvider(
            api_key=config.get("api_key", ""),
            model=config.get("model", "claude-sonnet-4-5-20250929"),
        )
    elif provider_type == "google":
        return GoogleProvider(
            api_key=config.get("api_key", ""),
            model=config.get("model", "gemini-2.0-flash"),
        )
    else:
        raise ValueError(f"Unknown provider: {provider_type}")
