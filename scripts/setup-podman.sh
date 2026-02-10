#!/bin/bash
# MCP DevOps Lab — One-command setup (Podman version)
# Creates .env, starts services, grabs the Gitea token, and injects it into .env

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/.env"
ENV_EXAMPLE="$PROJECT_DIR/.env.example"

echo "========================================"
echo "  MCP DevOps Lab — Setup (Podman)"
echo "========================================"
echo ""

# 1. Create .env from example if it doesn't exist
if [ ! -f "$ENV_FILE" ]; then
  echo "[1/4] Creating .env from .env.example..."
  cp "$ENV_EXAMPLE" "$ENV_FILE"
else
  echo "[1/4] .env already exists (keeping it)"
fi

# 2. Start all services
echo "[2/4] Starting services (this may take a minute on first run)..."
cd "$PROJECT_DIR"
podman compose up -d

# 3. Wait for bootstrap to finish and grab the Gitea token
echo "[3/4] Waiting for bootstrap to complete..."
ATTEMPTS=0
MAX_ATTEMPTS=60
TOKEN=""

while [ $ATTEMPTS -lt $MAX_ATTEMPTS ]; do
  # Check if bootstrap container has exited
  STATUS=$(podman compose ps bootstrap --format json 2>/dev/null | grep -o '"State":"[^"]*"' | head -1 | cut -d'"' -f4)
  if [ "$STATUS" = "exited" ]; then
    # Parse token from bootstrap logs
    TOKEN=$(podman compose logs bootstrap 2>/dev/null | grep "GITEA_TOKEN=" | tail -1 | sed 's/.*GITEA_TOKEN=//')
    break
  fi
  ATTEMPTS=$((ATTEMPTS + 1))
  sleep 2
done

if [ -z "$TOKEN" ]; then
  echo "    WARNING: Could not grab Gitea token automatically."
  echo "    Run 'podman compose logs bootstrap' and copy the token manually."
  echo ""
else
  echo "    Got Gitea token: ${TOKEN:0:8}..."

  # 4. Inject token into .env
  echo "[4/4] Updating .env with Gitea token..."
  if grep -q "^GITEA_TOKEN=" "$ENV_FILE"; then
    # Replace existing line (works on both macOS and Linux)
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s|^GITEA_TOKEN=.*|GITEA_TOKEN=$TOKEN|" "$ENV_FILE"
    else
      sed -i "s|^GITEA_TOKEN=.*|GITEA_TOKEN=$TOKEN|" "$ENV_FILE"
    fi
  else
    echo "GITEA_TOKEN=$TOKEN" >> "$ENV_FILE"
  fi
  echo "    .env updated with GITEA_TOKEN"

  # Restart MCP server so it picks up the token (needed for Gitea tools)
  echo "    Restarting mcp-server to pick up token..."
  podman compose restart mcp-server > /dev/null 2>&1
fi

echo ""
echo "========================================"
echo "  Setup Complete!"
echo "========================================"
echo ""
echo "  Open the Chat UI:  http://localhost:3001"
echo "  Gitea:             http://localhost:3000"
echo "  Gitea admin:       mcpadmin / mcpadmin123"
echo ""
echo "  MCP feature switches are OFF by default."
echo "  Enable them in .env as you progress through the lab:"
echo "    GITEA_MCP_ENABLED=true"
echo "    REGISTRY_MCP_ENABLED=true"
echo "    PROMOTION_MCP_ENABLED=true"
echo ""
echo "  After changing .env, restart the MCP server:"
echo "    podman compose restart mcp-server"
echo ""
echo "  To push a sample image to the dev registry:"
echo "    podman pull alpine:3.19"
echo "    podman tag alpine:3.19 localhost:5001/sample-app:v1.0.0"
echo "    podman push localhost:5001/sample-app:v1.0.0 --tls-verify=false"
echo ""
