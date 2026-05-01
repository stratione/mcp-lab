#!/usr/bin/env bash
# stdio launcher for Claude Code — Runner MCP server (build/scan/deploy)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

export MCP_TRANSPORT=stdio
export DEV_REGISTRY_HOST="${DEV_REGISTRY_HOST:-localhost:5001}"
export GITEA_URL="${GITEA_URL:-http://localhost:3000}"

exec python -m mcp_server.server_runner
