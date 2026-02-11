#!/usr/bin/env bash
# stdio launcher for Claude Code — Gitea MCP server
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

export MCP_TRANSPORT=stdio
export GITEA_URL="${GITEA_URL:-http://localhost:3000}"

exec python -m mcp_server.server_gitea
