#!/bin/bash
# MCP DevOps Lab — Restart lab services after code changes.
#
# Rebuilds and restarts the three locally-built core services:
#   chat-ui, user-api, promotion-service
#
# MCP servers (mcp-user, mcp-gitea, mcp-registry, mcp-promotion) are
# intentionally left alone — manage them separately as you progress through
# the lab phases.  Use `docker/podman compose up -d mcp-<name>` to start
# individual servers.
#
# Usage:
#   ./scripts/2-restart-lab.sh           # rebuild + restart core services
#   ./scripts/2-restart-lab.sh --full    # same + restart gitea, registries too

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

source "$SCRIPT_DIR/_detect-engine.sh"

FULL=false
if [[ "${1:-}" == "--full" ]]; then
  FULL=true
fi

cd "$PROJECT_DIR"

echo "========================================"
echo "  MCP DevOps Lab — Restart ($ENGINE)"
echo "========================================"
echo ""

# Core services with a local build context — always rebuilt
CORE_SERVICES="chat-ui user-api promotion-service"

if $FULL; then
  echo "  Mode: full restart (core + gitea + registries)"
  echo ""
  EXTRA_SERVICES="gitea registry-dev registry-prod"
else
  echo "  Mode: core only  (pass --full to also restart gitea + registries)"
  echo ""
  EXTRA_SERVICES=""
fi

echo "[1/2] Rebuilding and restarting core services..."
$COMPOSE up -d --build $CORE_SERVICES

if $FULL && [ -n "$EXTRA_SERVICES" ]; then
  echo "[1/2] Restarting stateful services..."
  $COMPOSE restart $EXTRA_SERVICES
fi

echo "[2/2] Waiting for chat-ui to become healthy..."
ATTEMPTS=0
MAX_ATTEMPTS=30
while [ $ATTEMPTS -lt $MAX_ATTEMPTS ]; do
  STATUS=$($COMPOSE ps chat-ui --format json 2>/dev/null | grep -o '"Health":"[^"]*"' | head -1 | cut -d'"' -f4 || true)
  if [ "$STATUS" = "healthy" ]; then
    break
  fi
  printf "."
  sleep 2
  ATTEMPTS=$((ATTEMPTS + 1))
done
echo ""

echo ""
echo "========================================"
echo ""
echo "  Lab restarted.  Navigate to:"
echo ""
echo "    http://localhost:3001"
echo ""
echo "  Active MCP servers are unchanged."
echo "  Check status with:  $COMPOSE ps"
echo ""
echo "========================================"
echo ""
