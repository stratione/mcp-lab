#!/usr/bin/env bash
# MCP DevOps Lab — Between-session reset (Milestone 6).
#
# Restores the seeded baseline so the presenter can re-run the same demo
# back-to-back at multiple sessions:
#   - stop all MCP servers
#   - delete users with id > 6 (preserves alice/bob/charlie/diana/eve/system)
#   - remove the hello-app-* deploy containers
#   - wipe and recreate the prod registry volume
#   - clear chat history
#   - reset Hallucination Mode to OFF
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

if [ -x "$SCRIPT_DIR/_detect-engine.sh" ]; then
  source "$SCRIPT_DIR/_detect-engine.sh"
fi
COMPOSE="${COMPOSE:-podman compose}"
ENGINE="${ENGINE:-podman}"

echo "[1/6] Stopping all MCP servers..."
$COMPOSE stop mcp-user mcp-gitea mcp-registry mcp-promotion mcp-runner 2>&1 | tail -3 || true

echo "[2/6] Deleting users with id > 6 (preserving seeded baseline)..."
ids=$(curl -sf http://localhost:8001/users 2>/dev/null \
  | python3 -c "import json,sys; [print(u['id']) for u in json.load(sys.stdin) if u['id']>6]" 2>/dev/null || true)
if [ -n "$ids" ]; then
  for id in $ids; do
    curl -sX DELETE "http://localhost:8001/users/$id" >/dev/null && echo "  deleted user $id" || true
  done
else
  echo "  no extra users to remove"
fi

echo "[3/6] Removing the hello-app-{dev,staging,prod} deploy containers..."
for env_name in dev staging prod; do
  $ENGINE rm -f "hello-app-$env_name" >/dev/null 2>&1 && echo "  removed hello-app-$env_name" || true
done

echo "[4/6] Wiping prod registry (recreating the volume to clear all images)..."
$COMPOSE stop registry-prod >/dev/null 2>&1 || true
$ENGINE volume rm mcp-lab_registry-prod-data >/dev/null 2>&1 || true
$COMPOSE up -d registry-prod >/dev/null 2>&1 || true

echo "[5/6] Clearing chat history..."
curl -sX DELETE http://localhost:3001/api/chat-history >/dev/null 2>&1 || true

echo "[6/6] Resetting Hallucination Mode to OFF..."
curl -sX POST http://localhost:3001/api/hallucination-mode \
  -H 'Content-Type: application/json' -d '{"enabled":false}' >/dev/null 2>&1 || true

echo "[7/7] Resetting active provider to Ollama default..."
# Stops a previous session's provider/key/model from leaking into the next one.
curl -sX POST http://localhost:3001/api/provider \
  -H 'Content-Type: application/json' \
  -d '{"provider":"ollama","model":"llama3.1:8b"}' >/dev/null 2>&1 || true

echo ""
echo "================================================================"
echo "  Reset complete. Lab is back to the seeded baseline."
echo "  All MCP servers are stopped — bring them up via the dashboard"
echo "  or with:  ./scripts/7-workshop.sh"
echo "================================================================"
