#!/bin/bash
# MCP DevOps Lab — Refresh (rebuild + restart) all running containers.
#
# Unlike 2-start-lab.sh (which only touches core services), this script
# rebuilds and restarts EVERYTHING that is currently running — core services,
# MCP servers, Gitea, registries — without destroying volumes or data.
#
# Unlike 5-teardown.sh, this does NOT delete containers, images, volumes, or
# networks. It just rebuilds and restarts in-place.
#
# Usage:
#   ./scripts/3-refresh-lab.sh          # rebuild + restart all running services
#   ./scripts/3-refresh-lab.sh --all    # rebuild + restart ALL services (including stopped)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

source "$SCRIPT_DIR/_detect-engine.sh"

PASS="✅"
FAIL="❌"

ALL=false
if [[ "${1:-}" == "--all" ]]; then
  ALL=true
fi

cd "$PROJECT_DIR"

echo "========================================"
echo "  MCP DevOps Lab — Refresh ($ENGINE)"
echo "========================================"
echo ""

if $ALL; then
  echo "  Mode: all services (including stopped)"
  echo ""
  echo "[1/3] Rebuilding and restarting all services..."
  COMPOSE_PROFILES=user,gitea,registry,promotion $COMPOSE up -d --build
else
  # Get list of currently running services
  RUNNING=$($COMPOSE ps --format '{{.Service}}' 2>/dev/null | sort -u)
  if [ -z "$RUNNING" ]; then
    echo "  No services are currently running."
    echo "  Use ./scripts/2-start-lab.sh to start the lab first."
    echo ""
    exit 0
  fi
  echo "  Mode: running services only (pass --all to include stopped)"
  echo ""
  echo "  Services to refresh:"
  for svc in $RUNNING; do
    echo "    - $svc"
  done
  echo ""
  echo "[1/3] Rebuilding and restarting running services..."
  COMPOSE_PROFILES=user,gitea,registry,promotion $COMPOSE up -d --build $RUNNING
fi

echo ""
echo "[2/3] Waiting for chat-ui to become healthy..."
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

# ── Service health checks ──────────────────────────────────────────────────
echo ""
echo "[3/3] Verifying services..."
echo ""

TESTS_PASSED=0
TESTS_FAILED=0

check_service() {
  local name="$1"
  local url="$2"
  if curl -sf "$url" > /dev/null 2>&1; then
    echo "  $PASS  $name"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo "  $FAIL  $name ($url)"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}

check_service "Chat UI           " "http://localhost:3001"
check_service "User API          " "http://localhost:8001/health"
check_service "User API roles    " "http://localhost:8001/users/roles"
check_service "Promotion Service " "http://localhost:8002/health"
check_service "Gitea             " "http://localhost:3000/api/v1/version"
check_service "Registry (dev)    " "http://localhost:5001/v2/_catalog"
check_service "Registry (prod)   " "http://localhost:5002/v2/_catalog"

# Check for any running MCP servers (SSE endpoints return 406, so just check connectivity)
check_mcp() {
  local name="$1"
  local url="$2"
  if curl -so /dev/null -w '' "$url" 2>/dev/null; then
    echo "  $PASS  $name"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo "  $FAIL  $name ($url)"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}

echo ""
echo "  MCP Servers (optional — awareness only)"
for port_name in "8003:mcp-user" "8004:mcp-gitea" "8005:mcp-registry" "8006:mcp-promotion"; do
  PORT="${port_name%%:*}"
  NAME="${port_name##*:}"
  check_mcp "$NAME" "http://localhost:$PORT/mcp"
done

TOTAL=$((TESTS_PASSED + TESTS_FAILED))
echo ""
if [ "$TESTS_FAILED" -eq 0 ]; then
  echo "  All $TOTAL tests passed $PASS"
else
  echo "  $TESTS_PASSED/$TOTAL passed, $TESTS_FAILED failed $FAIL"
fi

echo ""
echo "========================================"
echo ""
echo "  Lab refreshed.  Navigate to:"
echo ""
echo "    http://localhost:3001"
echo ""
echo "  All data (users, repos, images) preserved."
echo "  Check status with:  $COMPOSE ps"
echo ""
echo "========================================"
echo ""
