#!/usr/bin/env bash
# stdio launcher for Claude Code — Registry MCP server
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

export MCP_TRANSPORT=stdio
export DEV_REGISTRY_URL="${DEV_REGISTRY_URL:-http://localhost:5001}"
export PROD_REGISTRY_URL="${PROD_REGISTRY_URL:-http://localhost:5002}"

exec python -m mcp_server.server_registry
