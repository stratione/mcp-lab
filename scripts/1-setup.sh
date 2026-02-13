#!/bin/bash
# MCP DevOps Lab — One-command setup (works with Docker or Podman)
# Creates .env, starts services, grabs the Gitea token, and injects it into .env

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/.env"
ENV_EXAMPLE="$PROJECT_DIR/.env.example"
ENV_SECRETS_FILE="$PROJECT_DIR/.env.secrets"

# ── Detect container engine (prompts user if both are available) ──
source "$SCRIPT_DIR/_detect-engine.sh"

# Render a simple terminal progress bar.
# Args: current total label
render_progress_bar() {
  local current="$1"
  local total="$2"
  local label="$3"
  local width=30
  local percent=0
  local filled=0
  local empty=0
  local bar_filled=""
  local bar_empty=""

  if [ "$total" -gt 0 ]; then
    percent=$(( current * 100 / total ))
  fi

  if [ "$percent" -gt 100 ]; then
    percent=100
  fi

  filled=$(( percent * width / 100 ))
  empty=$(( width - filled ))

  bar_filled=$(printf "%${filled}s" "" | tr ' ' '#')
  bar_empty=$(printf "%${empty}s" "" | tr ' ' '-')

  printf "\r[%-30s] %3d%%  %s" "${bar_filled}${bar_empty}" "$percent" "$label"
}

echo "========================================"
echo "  MCP DevOps Lab — Setup ($ENGINE)"
echo "========================================"
echo ""

# 1. Create .env from example if it doesn't exist
if [ ! -f "$ENV_FILE" ]; then
  echo "[1/4] Creating .env from .env.example..."
  cp "$ENV_EXAMPLE" "$ENV_FILE"
else
  echo "[1/4] .env already exists (keeping it)"
fi

# Create .env.secrets if it doesn't exist.
# This file holds optional API keys for cloud LLM providers.
# Ollama (local) works without any keys — fill these in only if you want
# to use OpenAI, Anthropic, or Google Gemini from the Chat UI.
if [ ! -f "$ENV_SECRETS_FILE" ]; then
  echo "[1/4] Creating .env.secrets with empty API key placeholders..."
  cat > "$ENV_SECRETS_FILE" << 'EOF'
# MCP DevOps Lab — Secret Keys  ⚠️  DO NOT SHARE / SCREEN-SHARE THIS FILE
# =========================================================================
# This file is gitignored and never committed. It stays on your machine only.
#
# All keys are OPTIONAL — the lab runs fully on Ollama (local) with no keys.
# Fill in a key only when you want to switch the Chat UI to that provider.
# You can change the active provider and model live from the Chat UI settings.

# ──── Anthropic (Claude models) ───────────────────────────────────────────
# Used when LLM_PROVIDER=anthropic in .env or selected in the Chat UI.
# Get your key at: https://console.anthropic.com/settings/keys
ANTHROPIC_API_KEY=

# ──── OpenAI (GPT-4o and friends) ─────────────────────────────────────────
# Used when LLM_PROVIDER=openai in .env or selected in the Chat UI.
# Get your key at: https://platform.openai.com/api-keys
OPENAI_API_KEY=

# ──── Google Gemini ────────────────────────────────────────────────────────
# Used when LLM_PROVIDER=google in .env or selected in the Chat UI.
# Get your key at: https://aistudio.google.com/app/apikey
GOOGLE_API_KEY=
EOF
else
  echo "[1/4] .env.secrets already exists (keeping it)"
fi

# Inject detected container engine into .env so the Chat UI can show correct commands
if grep -q "^CONTAINER_ENGINE=" "$ENV_FILE"; then
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s|^CONTAINER_ENGINE=.*|CONTAINER_ENGINE=$ENGINE|" "$ENV_FILE"
  else
    sed -i "s|^CONTAINER_ENGINE=.*|CONTAINER_ENGINE=$ENGINE|" "$ENV_FILE"
  fi
else
  echo "CONTAINER_ENGINE=$ENGINE" >> "$ENV_FILE"
fi

# 2. Start all services
echo "[2/4] Starting services (this may take a minute on first run)..."
cd "$PROJECT_DIR"
$COMPOSE up -d

# 3. Wait for bootstrap to finish and grab the Gitea token
echo "[3/4] Waiting for bootstrap to complete..."
ATTEMPTS=0
MAX_ATTEMPTS=120
TOKEN=""
STATUS=""
BOOTSTRAP_CID="$($COMPOSE ps -q bootstrap 2>/dev/null | head -1)"

render_progress_bar 0 "$MAX_ATTEMPTS" "Waiting for bootstrap"

while [ $ATTEMPTS -lt $MAX_ATTEMPTS ]; do
  # Resolve bootstrap container id once (can be empty for the first moments).
  if [ -z "$BOOTSTRAP_CID" ]; then
    BOOTSTRAP_CID="$($COMPOSE ps -q bootstrap 2>/dev/null | head -1)"
  fi

  # Check bootstrap state (faster than repeated compose parsing).
  if [ -n "$BOOTSTRAP_CID" ]; then
    STATUS="$($ENGINE inspect -f '{{.State.Status}}' "$BOOTSTRAP_CID" 2>/dev/null || true)"
  fi

  if [ "$STATUS" = "exited" ]; then
    # Parse token from bootstrap logs
    TOKEN=$($COMPOSE logs bootstrap 2>/dev/null | grep "GITEA_TOKEN=" | tail -1 | sed 's/.*GITEA_TOKEN=//')
    render_progress_bar "$MAX_ATTEMPTS" "$MAX_ATTEMPTS" "Bootstrap complete"
    echo ""
    break
  fi

  render_progress_bar "$ATTEMPTS" "$MAX_ATTEMPTS" "Waiting for bootstrap"
  ATTEMPTS=$((ATTEMPTS + 1))
  sleep 1
done

if [ $ATTEMPTS -ge $MAX_ATTEMPTS ] && [ "$STATUS" != "exited" ]; then
  render_progress_bar "$MAX_ATTEMPTS" "$MAX_ATTEMPTS" "Timed out waiting for bootstrap"
  echo ""
fi

if [ -z "$TOKEN" ]; then
  echo "    WARNING: Could not grab Gitea token automatically."
  echo "    Run '$COMPOSE logs bootstrap' and copy the token manually."
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

  # Restart mcp-gitea only if it's currently running.
  MCP_GITEA_STATE=$($COMPOSE ps mcp-gitea --format json 2>/dev/null | grep -o '"State":"[^"]*"' | head -1 | cut -d'"' -f4 || true)
  if [ "$MCP_GITEA_STATE" = "running" ]; then
    echo "    Restarting mcp-gitea to pick up token..."
    $COMPOSE restart mcp-gitea > /dev/null 2>&1 || true
  fi
fi

echo ""
echo "========================================================"
echo ""
echo "  Congrats! Your MCP DevOps Lab is up and running!"
echo ""
echo "  Open your browser:  http://localhost:3001"
echo ""
echo "  Gitea admin:  mcpadmin / mcpadmin123"
echo ""
echo "========================================================"
echo ""
