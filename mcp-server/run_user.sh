#!/usr/bin/env bash
# stdio launcher for Claude Code — User MCP server
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

export MCP_TRANSPORT=stdio
export USER_API_URL="${USER_API_URL:-http://localhost:8001}"

exec python -m mcp_server.server_user
