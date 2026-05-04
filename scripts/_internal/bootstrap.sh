#!/bin/sh
set -e

# Engine is injected from compose (CONTAINER_ENGINE), set by 2-setup.sh
# based on the user's docker/podman choice. Defaults to docker if unset.
ENGINE="${CONTAINER_ENGINE:-docker}"

echo "========================================"
echo "  MCP DevOps Lab — Bootstrap ($ENGINE)"
echo "========================================"

if ! command -v curl >/dev/null 2>&1 || ! command -v jq >/dev/null 2>&1; then
  apk add --no-cache curl jq > /dev/null 2>&1
fi

# Tier-aware: gitea + the dev registry are optional in small/medium tiers.
# We probe each before running its seed script so `make small` (which omits
# them entirely) doesn't hang or error on a missing service. Each probe is
# a single HTTP call — cheap, no retries needed because compose's
# depends_on already gated us on the deps that ARE present.
GITEA_UP=0
REGISTRY_DEV_UP=0

if curl -sf -o /dev/null --max-time 3 http://gitea:3000/api/v1/version 2>/dev/null; then
  GITEA_UP=1
fi
if curl -sf -o /dev/null --max-time 3 http://registry-dev:5000/v2/ 2>/dev/null; then
  REGISTRY_DEV_UP=1
fi

if [ "$GITEA_UP" = 1 ]; then
  echo "[*] Initializing Gitea..."
  sh /scripts/_internal/init-gitea.sh
else
  echo "[*] Gitea not in this tier — skipping init-gitea.sh."
fi

if [ "$REGISTRY_DEV_UP" = 1 ]; then
  echo "[*] Seeding dev registry with sample images..."
  sh /scripts/_internal/seed-registry.sh
else
  echo "[*] Dev registry not in this tier — skipping seed-registry.sh."
fi

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
echo "  User API health      http://localhost:8001/health"
if [ "$GITEA_UP" = 1 ]; then
  echo "  Gitea (Git hosting)  http://localhost:3000"
fi
if [ "$REGISTRY_DEV_UP" = 1 ]; then
  echo "  Registry Dev         http://localhost:5001/v2/_catalog"
  echo "  Registry Prod        http://localhost:5002/v2/_catalog"
  echo "  Promotion health     http://localhost:8002/health"
fi
echo ""
echo "  MCP Servers (always OFF by default — opt in below)"
echo "  ────────────────────────────────────────────────────"
echo ""
echo "  mcp-user               http://localhost:8003/mcp  7 tools"
if [ "$GITEA_UP" = 1 ]; then
  echo "  mcp-gitea              http://localhost:8004/mcp  7 tools"
fi
if [ "$REGISTRY_DEV_UP" = 1 ]; then
  echo "  mcp-registry           http://localhost:8005/mcp  3 tools"
  echo "  mcp-promotion          http://localhost:8006/mcp  3 tools"
  echo "  mcp-runner             http://localhost:8007/mcp  3 tools"
fi
echo ""
if [ "$GITEA_UP" = 1 ]; then
  echo "  Credentials"
  echo "  ────────────────────────────────────────────────────"
  echo ""
  echo "  Gitea admin:  mcpadmin / mcpadmin123"
  echo ""
fi
echo "  Getting Started"
echo "  ────────────────────────────────────────────────────"
echo ""
echo "  1. Open the Chat UI:  http://localhost:3001"
echo "  2. Enable MCP servers one at a time as you progress:"
echo ""
echo "     $ENGINE compose up -d mcp-user        # +7 user tools"
if [ "$GITEA_UP" = 1 ]; then
  echo "     $ENGINE compose up -d mcp-gitea       # +7 git/repo tools"
fi
if [ "$REGISTRY_DEV_UP" = 1 ]; then
  echo "     $ENGINE compose up -d mcp-registry    # +3 registry tools"
  echo "     $ENGINE compose up -d mcp-promotion   # +3 promotion tools"
  echo "     $ENGINE compose up -d mcp-runner      # +3 build/scan/deploy tools"
fi
echo ""
echo "  3. To stop an MCP server:"
echo ""
echo "     $ENGINE compose stop mcp-user"
echo ""
if [ "$GITEA_UP" != 1 ] || [ "$REGISTRY_DEV_UP" != 1 ]; then
  echo "  Want more tools? Level up to a bigger tier:"
  if [ "$GITEA_UP" != 1 ]; then
    echo "     make medium      # adds Gitea + per-user auth demos"
  fi
  if [ "$REGISTRY_DEV_UP" != 1 ]; then
    echo "     make large       # adds registries + promotion + runner (full lab)"
  fi
  echo ""
fi
echo "  Navigate to:  http://localhost:3001"
echo "  Restart lab:  ./scripts/restart.sh           (--core | --all)"
echo "  Tear down:    ./scripts/3-teardown.sh"
echo ""
echo "========================================================"
