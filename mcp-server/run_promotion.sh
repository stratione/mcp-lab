#!/usr/bin/env bash
# stdio launcher for Claude Code — Promotion MCP server
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

export MCP_TRANSPORT=stdio
export PROMOTION_SERVICE_URL="${PROMOTION_SERVICE_URL:-http://localhost:8002}"

exec python -m mcp_server.server_promotion
