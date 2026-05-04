#!/bin/bash
# MCP DevOps Lab — One-command setup (works with Docker or Podman)
# Creates .env, starts services, grabs the Gitea token, and injects it into .env
#
# Tier selection:
#   --tier=small    user-api + chat-ui + mcp-user                         (~700 MB)
#   --tier=medium   + Gitea + mcp-gitea                                   (~900 MB)
#   --tier=large    + registries + promotion + runner — full lab          (~1.5 GB)
#   (no flag)       interactive prompt if a TTY; otherwise defaults to large
#                   (preserves prior single-command behavior for CI/automation)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/.env"
ENV_EXAMPLE="$PROJECT_DIR/.env.example"
ENV_SECRETS_FILE="$PROJECT_DIR/.env.secrets"

# ── Parse args ──
TIER=""
for arg in "$@"; do
  case "$arg" in
    --tier=small|--tier=medium|--tier=large)
      TIER="${arg#--tier=}"
      ;;
    --tier=*)
      echo "Unknown tier: ${arg#--tier=} (must be: small, medium, large)" >&2
      exit 2
      ;;
    -h|--help)
      sed -n '2,11p' "$0" | sed 's|^# \{0,1\}||'
      exit 0
      ;;
    *)
      echo "Unknown arg: $arg" >&2
      exit 2
      ;;
  esac
done

# ── Detect container engine (prompts user if both are available) ──
source "$SCRIPT_DIR/_internal/_detect-engine.sh"

# ── Resolve tier ──
# Precedence:
#   1. --tier=X flag (highest)
#   2. Interactive prompt — only when stdin is a TTY (real human at keyboard)
#   3. Last-used tier from .env (MCP_LAB_TIER) — for re-runs
#   4. Hard default = large — preserves the one-command full-lab behavior
#      that any existing CI / automation script depends on

# Read last-used tier if present (only used as the prompt's default)
LAST_TIER=""
if [ -f "$ENV_FILE" ]; then
  LAST_TIER="$(grep "^MCP_LAB_TIER=" "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2- || true)"
fi

if [ -z "$TIER" ]; then
  if [ -t 0 ]; then
    # Interactive: prompt
    DEFAULT_PROMPT_TIER="${LAST_TIER:-small}"
    case "$DEFAULT_PROMPT_TIER" in
      small)  DEFAULT_NUM=1 ;;
      medium) DEFAULT_NUM=2 ;;
      large)  DEFAULT_NUM=3 ;;
      *)      DEFAULT_NUM=1; DEFAULT_PROMPT_TIER="small" ;;
    esac
    echo ""
    echo "  Pick your tier  (you can level up later with 'make medium' / 'make large')"
    echo ""
    echo "    1) small  (~700 MB)  user-api + chat-ui + mcp-user             \"What is MCP?\""
    echo "    2) medium (~900 MB)  + Gitea + mcp-gitea                       \"MCP acts on your behalf\""
    echo "    3) large  (~1.5 GB)  + registries + promotion + runner         \"MCP runs your CI/CD\"  (full lab)"
    echo ""
    read -r -p "  Choice [1/2/3] (default: $DEFAULT_NUM = $DEFAULT_PROMPT_TIER): " CHOICE
    CHOICE="${CHOICE:-$DEFAULT_NUM}"
    case "$CHOICE" in
      1|small)  TIER="small" ;;
      2|medium) TIER="medium" ;;
      3|large)  TIER="large" ;;
      *)
        echo "  Invalid choice: $CHOICE — falling back to default ($DEFAULT_PROMPT_TIER)"
        TIER="$DEFAULT_PROMPT_TIER"
        ;;
    esac
    echo ""
  else
    # Non-TTY (CI, piped, automated): use hard default
    TIER="large"
  fi
fi

# Tier → service list and a description for messaging.
# Note: TIER controls what STARTS at boot. All 5 mcp-* images are still
# pre-built unconditionally below, so the chat-ui's per-service "Start"
# button works for ANY tool category regardless of tier.
case "$TIER" in
  small)
    TIER_SERVICES="user-api chat-ui mcp-user bootstrap"
    TIER_DESC="small (~700 MB) — user-api + chat-ui + mcp-user"
    TIER_HAS_GITEA=0
    ;;
  medium)
    TIER_SERVICES="user-api gitea chat-ui mcp-user mcp-gitea bootstrap"
    TIER_DESC="medium (~900 MB) — adds Gitea + mcp-gitea"
    TIER_HAS_GITEA=1
    ;;
  large)
    TIER_SERVICES=""  # empty = bare `compose up -d` (everything)
    TIER_DESC="large (~1.5 GB) — full lab"
    TIER_HAS_GITEA=1
    ;;
esac

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
echo "  Tier: $TIER_DESC"
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

# Cross-platform sed-in-place helper (BSD vs GNU).
sed_inplace() {
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "$@"
  else
    sed -i "$@"
  fi
}

# Inject detected container engine into .env so the Chat UI can show correct commands
if grep -q "^CONTAINER_ENGINE=" "$ENV_FILE"; then
  sed_inplace "s|^CONTAINER_ENGINE=.*|CONTAINER_ENGINE=$ENGINE|" "$ENV_FILE"
else
  echo "CONTAINER_ENGINE=$ENGINE" >> "$ENV_FILE"
fi

# Persist the chosen tier so re-runs default to it (the prompt uses this).
if grep -q "^MCP_LAB_TIER=" "$ENV_FILE"; then
  sed_inplace "s|^MCP_LAB_TIER=.*|MCP_LAB_TIER=$TIER|" "$ENV_FILE"
else
  echo "MCP_LAB_TIER=$TIER" >> "$ENV_FILE"
fi

# Record the host-side absolute path to the project so the Chat UI can
# render copy-able commands that work from ANY directory the user happens
# to be sitting in (terminal opens to scripts/, not the project root).
if grep -q "^HOST_PROJECT_DIR=" "$ENV_FILE"; then
  sed_inplace "s|^HOST_PROJECT_DIR=.*|HOST_PROJECT_DIR=$PROJECT_DIR|" "$ENV_FILE"
else
  echo "HOST_PROJECT_DIR=$PROJECT_DIR" >> "$ENV_FILE"
fi

# Pick the right host-gateway hostname for Ollama based on the engine.
# Docker Desktop:        host.docker.internal
# Podman on macOS/Linux: host.containers.internal
# (Modern Podman aliases host.docker.internal too, but we set the canonical
#  one so older Podman versions also work.)
if [ "$ENGINE" = "podman" ]; then
  OLLAMA_HOST="host.containers.internal"
else
  OLLAMA_HOST="host.docker.internal"
fi
DESIRED_OLLAMA_URL="http://${OLLAMA_HOST}:11434"

# Only rewrite OLLAMA_URL if the user hasn't set a non-default value.
# We treat the two stock host-gateway URLs as defaults the script may overwrite;
# any other value (custom IP, remote host, etc.) is preserved.
CURRENT_OLLAMA_URL="$(grep "^OLLAMA_URL=" "$ENV_FILE" | head -1 | cut -d= -f2- || true)"
case "$CURRENT_OLLAMA_URL" in
  ""|"http://host.docker.internal:11434"|"http://host.containers.internal:11434")
    if grep -q "^OLLAMA_URL=" "$ENV_FILE"; then
      sed_inplace "s|^OLLAMA_URL=.*|OLLAMA_URL=$DESIRED_OLLAMA_URL|" "$ENV_FILE"
    else
      echo "OLLAMA_URL=$DESIRED_OLLAMA_URL" >> "$ENV_FILE"
    fi
    ;;
esac

# 2. Start the services for this tier.
#    Empty TIER_SERVICES (large) means bare `compose up -d` (everything).
echo "[2/4] Starting services for tier '$TIER' (this may take a minute on first run)..."
cd "$PROJECT_DIR"
if [ -z "$TIER_SERVICES" ]; then
  $COMPOSE up -d
else
  $COMPOSE up -d $TIER_SERVICES
fi

# Pre-build ALL 5 MCP server images — even ones outside the current tier.
# Why: the chat-ui's "Start" button calls `compose up -d --no-build <service>`,
# which fails with "no such image" if the image hasn't been built yet. A user
# in the small tier might still click "Start mcp-gitea" from the dashboard to
# level up, and that click must succeed. Building is fast on subsequent runs
# (layer cache), so we pay the cost once at setup and every later Start click
# is instant. Tier only gates what RUNS, not what's BUILDABLE on click.
echo "[2b/4] Pre-building all 5 MCP server images so the chat-ui Start button works for any service..."
COMPOSE_PROFILES=user,gitea,registry,promotion,runner $COMPOSE build \
  mcp-user mcp-gitea mcp-registry mcp-promotion mcp-runner \
  > /tmp/mcp-build.log 2>&1 \
  && echo "    MCP images built (log: /tmp/mcp-build.log)" \
  || echo "    WARNING: MCP image build failed — see /tmp/mcp-build.log"

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

if [ "$TIER_HAS_GITEA" = 0 ]; then
  echo "[4/4] Skipping Gitea token extraction (tier '$TIER' has no Gitea)."
elif [ -z "$TOKEN" ]; then
  echo "    WARNING: Could not grab Gitea token automatically."
  echo "    Run '$COMPOSE logs bootstrap' and copy the token manually."
  echo ""
else
  echo "    Got Gitea token: ${TOKEN:0:8}..."

  # 4. Inject token into .env
  echo "[4/4] Updating .env with Gitea token..."
  if grep -q "^GITEA_TOKEN=" "$ENV_FILE"; then
    sed_inplace "s|^GITEA_TOKEN=.*|GITEA_TOKEN=$TOKEN|" "$ENV_FILE"
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
echo "  Congrats! Your MCP DevOps Lab ($TIER tier) is up and running!"
echo ""
echo "  Open your browser:    http://localhost:3001/?workshop=1"
echo ""
if [ "$TIER_HAS_GITEA" = 1 ]; then
  echo "  Gitea admin:          mcpadmin / mcpadmin123"
  echo ""
fi
if [ "$TIER" = "small" ]; then
  echo "  Want more tools? Level up at any time:"
  echo "      make medium       # adds Gitea + per-user auth demos"
  echo "      make large        # adds registries + promotion + runner (full lab)"
  echo ""
elif [ "$TIER" = "medium" ]; then
  echo "  Want the CI/CD pipeline? Level up:"
  echo "      make large        # adds registries + promotion + runner"
  echo ""
fi
echo "  ── Optional: Cloud LLM keys ──"
echo "  The lab works on Ollama with no keys. To use OpenAI / Anthropic"
echo "  / Google Gemini instead, edit .env.secrets (already created with"
echo "  empty placeholders + provider links) and run:"
echo ""
echo "      ./scripts/restart.sh --core"
echo ""
echo "  Or paste a key live in the Chat UI's provider chip — no restart"
echo "  needed for that path."
echo ""
echo "========================================================"
echo ""
