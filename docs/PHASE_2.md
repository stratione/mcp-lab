# Phase 2: Introducing MCP

In this phase, you introduce MCP as the unified interface layer. Start with just user tools enabled, then progressively unlock capabilities.

## Step 1: Open the Chat UI

1. Open http://localhost:3001 in your browser
2. Select your LLM provider:
   - **Ollama**: Free and local. Make sure Ollama is running with a model (e.g., `ollama pull llama3.1`)
   - **OpenAI/Anthropic/Google**: Enter your API key
3. Click **Apply**

## Step 2: User Tools (Always On)

The MCP server starts with 6 user management tools always enabled. Try these prompts:

- "List all users"
- "Create a new user named bob with email bob@example.com and role developer"
- "What role does alice have?"
- "Update alice's role to admin"

Notice: the agent calls MCP tools automatically. Each tool call is shown as a collapsible card in the chat.

## Step 3: Enable Gitea Tools

Edit `.env` and set:
```env
GITEA_MCP_ENABLED=true
GITEA_TOKEN=<paste-from-bootstrap-logs>
```

Restart the MCP server:
```bash
podman compose restart mcp-server
```

Refresh the chat UI. You should see 13 tools now (6 user + 7 Gitea). Try:

- "List all Git repositories"
- "Create a new repo called my-service"
- "What branches does sample-app have?"
- "Create a feature branch in sample-app"

Notice: no credentials needed in your prompts — MCP handles auth injection.

## Step 4: Enable Registry Tools

Edit `.env`:
```env
REGISTRY_MCP_ENABLED=true
```

Restart: `podman compose restart mcp-server`

Now 16 tools available. Try:

- "What images are in the dev registry?"
- "List tags for sample-app in dev"
- "Is sample-app available in the prod registry?"

## Step 5: Enable Promotion Tools

Edit `.env`:
```env
PROMOTION_MCP_ENABLED=true
```

Restart: `podman compose restart mcp-server`

All 19 tools available. Try:

- "Show all promotion records"
- "What's the status of promotion #1?"

## Reflection

Compare to Phase 1:
- **Unified interface** — one chat, one protocol
- **No credential management** — MCP injects auth automatically
- **Progressive disclosure** — tools appear as capabilities are enabled
- **Consistent experience** — same interaction pattern regardless of backend system

Proceed to [Phase 3](PHASE_3.md) for the full intent-based experience.
