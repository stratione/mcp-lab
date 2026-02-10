#!/usr/bin/env bash
# stdio launcher for Claude Code users
# Usage: ./run.sh
#
# Set environment variables before running:
#   export USER_API_URL=http://localhost:8001
#   export GITEA_URL=http://localhost:3000
#   export GITEA_TOKEN=<your-token>
#   export DEV_REGISTRY_URL=http://localhost:5001
#   export PROD_REGISTRY_URL=http://localhost:5002
#   export PROMOTION_SERVICE_URL=http://localhost:8002

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export MCP_TRANSPORT=stdio

# Default to localhost URLs for host-side usage
export USER_API_URL="${USER_API_URL:-http://localhost:8001}"
export GITEA_URL="${GITEA_URL:-http://localhost:3000}"
export DEV_REGISTRY_URL="${DEV_REGISTRY_URL:-http://localhost:5001}"
export PROD_REGISTRY_URL="${PROD_REGISTRY_URL:-http://localhost:5002}"
export PROMOTION_SERVICE_URL="${PROMOTION_SERVICE_URL:-http://localhost:8002}"

exec python -m mcp_server.server
