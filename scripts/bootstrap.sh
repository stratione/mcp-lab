#!/bin/sh
set -e

echo "========================================"
echo "  MCP DevOps Lab — Bootstrap"
echo "========================================"

if ! command -v curl >/dev/null 2>&1 || ! command -v jq >/dev/null 2>&1; then
  apk add --no-cache curl jq > /dev/null 2>&1
fi

# Compose already gates bootstrap on healthy dependencies via depends_on.
echo "[*] Dependencies already healthy (compose healthchecks passed)."

# Run init scripts
echo "[*] Initializing Gitea..."
sh /scripts/init-gitea.sh

echo "[*] Seeding dev registry with sample image..."
sh /scripts/seed-registry.sh

echo ""
echo "========================================================"
echo ""
echo "  Congrats! Your MCP DevOps Lab is up and running!"
echo ""
echo "========================================================"
echo ""
echo "  Services & URLs"
echo "  ────────────────────────────────────────────────────"
echo ""
echo "  Chat UI              http://localhost:3001"
echo "  Gitea (Git hosting)  http://localhost:3000"
echo "  User API health      http://localhost:8001/health"
echo "  Promotion health     http://localhost:8002/health"
echo "  Registry Dev         http://localhost:5001/v2/_catalog"
echo "  Registry Prod        http://localhost:5002/v2/_catalog"
echo ""
echo "  MCP Servers"
echo "  ────────────────────────────────────────────────────"
echo ""
echo "  mcp-user               http://localhost:8003/mcp  9 tools"
echo "  mcp-gitea              http://localhost:8004/mcp  7 tools"
echo "  mcp-registry           http://localhost:8005/mcp  3 tools"
echo "  mcp-promotion          http://localhost:8006/mcp  3 tools"
echo ""
echo "  Credentials"
echo "  ────────────────────────────────────────────────────"
echo ""
echo "  Gitea admin:  mcpadmin / mcpadmin123"
echo ""
echo "  Getting Started"
echo "  ────────────────────────────────────────────────────"
echo ""
echo "  1. Open the Chat UI:  http://localhost:3001"
echo "  2. All MCP servers start OFF by default."
echo "  3. Enable MCP servers one at a time as you progress:"
echo ""
echo "     docker compose up -d mcp-user        # +8 user tools"
echo "     docker compose up -d mcp-gitea       # +7 git/repo tools"
echo "     docker compose up -d mcp-registry    # +3 registry tools"
echo "     docker compose up -d mcp-promotion   # +3 promotion tools"
echo ""
echo "     (Podman users: replace 'docker' with 'podman')"
echo ""
echo "  4. To stop an MCP server:"
echo ""
echo "     docker compose stop mcp-user"
echo ""
echo "  5 sample images have been pushed to the dev registry automatically."
echo ""
echo "  Navigate to:  http://localhost:3001"
echo "  Start lab:    ./scripts/2-start-lab.sh"
echo "  Refresh lab:                   ./scripts/3-refresh-lab.sh"
echo "  Open API docs only:            ./scripts/4-open-api-docs.sh"
echo ""
echo "========================================================"
