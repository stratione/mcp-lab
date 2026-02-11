#!/bin/bash
# MCP DevOps Lab — Preflight Check
# Detects container runtime, RAM, and guides install if needed.
# Run this FIRST before anything else.

set -e

PASS="✅"
WARN="⚠️ "
FAIL="❌"

echo ""
echo "========================================"
echo "  MCP DevOps Lab — Preflight Check"
echo "========================================"
echo ""

ALL_GOOD=true

# ── 1. OS Detection ────────────────────────────────────────────────────────
OS="$(uname -s)"
ARCH="$(uname -m)"
echo "  System:  $OS / $ARCH"
echo ""

# ── 2. RAM Check ───────────────────────────────────────────────────────────
echo "  Checking RAM..."
if [[ "$OS" == "Darwin" ]]; then
  RAM_BYTES=$(sysctl -n hw.memsize 2>/dev/null || echo 0)
  RAM_GB=$(( RAM_BYTES / 1024 / 1024 / 1024 ))
elif [[ "$OS" == "Linux" ]]; then
  RAM_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
  RAM_GB=$(( RAM_KB / 1024 / 1024 ))
else
  RAM_GB=0
fi

if [ "$RAM_GB" -ge 8 ]; then
  echo "  $PASS  RAM: ${RAM_GB} GB (minimum 8 GB required)"
else
  echo "  $WARN  RAM: ${RAM_GB} GB detected. 8 GB minimum recommended."
  echo "         The lab may run slowly on this machine."
fi
echo ""

# ── 3. Container Runtime Check ─────────────────────────────────────────────
echo "  Checking container runtime..."
echo ""

PODMAN_OK=false
DOCKER_OK=false
COMPOSE_CMD=""

# Check Podman
if command -v podman &>/dev/null; then
  PODMAN_VER=$(podman --version 2>/dev/null | awk '{print $3}')
  echo "  $PASS  Podman $PODMAN_VER found"
  PODMAN_OK=true

  # Check if Podman machine is running (macOS/Windows)
  if [[ "$OS" == "Darwin" ]] || [[ "$OS" == "MINGW"* ]]; then
    MACHINE_STATE=$(podman machine list --format "{{.Running}}" 2>/dev/null | head -1 || echo "")
    if [[ "$MACHINE_STATE" == "true" ]]; then
      echo "  $PASS  Podman machine is running"
    else
      echo "  $FAIL  Podman machine is NOT running"
      echo ""
      echo "         Fix: start a Podman machine:"
      echo ""
      echo "           podman machine init    # first time only"
      echo "           podman machine start"
      echo ""
      ALL_GOOD=false
    fi
  fi
else
  echo "  $FAIL  Podman not found"
fi

# Check Docker
if command -v docker &>/dev/null; then
  DOCKER_VER=$(docker --version 2>/dev/null | awk '{print $3}' | tr -d ',')
  if docker info &>/dev/null 2>&1; then
    echo "  $PASS  Docker $DOCKER_VER found and running"
    DOCKER_OK=true
  else
    echo "  $WARN  Docker $DOCKER_VER found but daemon is not running"
    echo "         Start Docker Desktop or run: sudo systemctl start docker"
  fi
fi
echo ""

# ── 4. Determine compose command ───────────────────────────────────────────
echo "  Checking compose..."
if $PODMAN_OK && command -v docker-compose &>/dev/null; then
  echo "  $PASS  podman compose available (via docker-compose)"
  COMPOSE_CMD="podman compose"
elif $PODMAN_OK && podman compose version &>/dev/null 2>&1; then
  echo "  $PASS  podman compose available"
  COMPOSE_CMD="podman compose"
elif $DOCKER_OK && docker compose version &>/dev/null 2>&1; then
  echo "  $PASS  docker compose available"
  COMPOSE_CMD="docker compose"
else
  echo "  $FAIL  No compose command found"
  ALL_GOOD=false
fi
echo ""

# ── 5. curl check ──────────────────────────────────────────────────────────
echo "  Checking curl..."
if command -v curl &>/dev/null; then
  echo "  $PASS  curl found"
else
  echo "  $FAIL  curl not found (needed for health checks and exercises)"
  ALL_GOOD=false
fi
echo ""

# ── 6. git check ───────────────────────────────────────────────────────────
echo "  Checking git..."
if command -v git &>/dev/null; then
  GIT_VER=$(git --version | awk '{print $3}')
  echo "  $PASS  git $GIT_VER found"
else
  echo "  $FAIL  git not found"
  ALL_GOOD=false
fi
echo ""

# ── 7. Ollama check (optional) ─────────────────────────────────────────────
echo "  Checking Ollama (optional — needed for free local LLM)..."
if command -v ollama &>/dev/null; then
  if curl -sf http://localhost:11434/api/version &>/dev/null; then
    OLLAMA_MODEL=$(ollama list 2>/dev/null | grep "llama3.1:8b" || true)
    if [ -n "$OLLAMA_MODEL" ]; then
      echo "  $PASS  Ollama running with llama3.1:8b"
    else
      echo "  $WARN  Ollama running but llama3.1:8b not pulled"
      echo ""
      echo "         Fix:  ollama pull llama3.1:8b"
      echo ""
      echo "         Note: The lab works with OpenAI / Anthropic / Google keys too."
    fi
  else
    echo "  $WARN  Ollama installed but not running"
    echo ""
    echo "         Fix:  ollama serve   (in a separate terminal)"
    echo ""
    echo "         Note: The lab works with OpenAI / Anthropic / Google keys too."
  fi
else
  echo "  $WARN  Ollama not installed (optional)"
  echo ""
  echo "         To install Ollama (free local LLM, no API key needed):"
  if [[ "$OS" == "Darwin" ]]; then
    echo "           brew install ollama"
    echo "           ollama serve &"
    echo "           ollama pull llama3.1:8b"
  elif [[ "$OS" == "Linux" ]]; then
    echo "           curl -fsSL https://ollama.ai/install.sh | sh"
    echo "           ollama pull llama3.1:8b"
  else
    echo "           https://ollama.ai/download"
  fi
  echo ""
  echo "         Alternatively, add an API key to .env.secrets for"
  echo "         OpenAI (OPENAI_API_KEY), Anthropic (ANTHROPIC_API_KEY),"
  echo "         or Google (GOOGLE_API_KEY)."
fi
echo ""

# ── 8. Result ──────────────────────────────────────────────────────────────
echo "========================================"

if $ALL_GOOD; then
  echo ""
  echo "  $PASS  All checks passed!"
  echo ""
  if [ -n "$COMPOSE_CMD" ]; then
    echo "  Ready to run:  ./scripts/2-setup-podman.sh"
  fi
  echo ""
  echo "========================================"
  echo ""
  exit 0
else
  echo ""
  echo "  $FAIL  Some checks failed. Fix the issues above, then re-run:"
  echo ""
  echo "         ./scripts/0-preflight.sh"
  echo ""

  # ── Install guidance ───────────────────────────────────────────────────
  if ! $PODMAN_OK && ! $DOCKER_OK; then
    echo "========================================"
    echo ""
    echo "  INSTALL GUIDE — Container Runtime"
    echo ""
    echo "  The lab requires Podman (recommended) or Docker."
    echo ""
    if [[ "$OS" == "Darwin" ]]; then
      echo "  Option A — Podman Desktop (recommended for macOS):"
      echo ""
      echo "    1. Download: https://podman-desktop.io"
      echo "       Or via Homebrew:"
      echo "         brew install podman-desktop"
      echo "         brew install podman"
      echo ""
      echo "    2. Initialize and start the Podman machine:"
      echo "         podman machine init"
      echo "         podman machine start"
      echo ""
      echo "    3. Install compose support:"
      echo "         brew install docker-compose"
      echo ""
      echo "  Option B — Docker Desktop:"
      echo ""
      echo "    1. Download: https://www.docker.com/products/docker-desktop"
      echo "    2. Install and start Docker Desktop"
      echo "    3. Verify: docker info"
      echo ""
    elif [[ "$OS" == "Linux" ]]; then
      echo "  Option A — Podman (recommended):"
      echo ""
      echo "    Ubuntu/Debian:"
      echo "      sudo apt-get update && sudo apt-get install -y podman"
      echo "      sudo apt-get install -y docker-compose"
      echo ""
      echo "    Fedora/RHEL:"
      echo "      sudo dnf install -y podman docker-compose"
      echo ""
      echo "  Option B — Docker:"
      echo ""
      echo "    curl -fsSL https://get.docker.com | sh"
      echo "    sudo systemctl start docker"
      echo "    sudo usermod -aG docker \$USER   # log out and back in"
      echo ""
    else
      echo "  Download Podman Desktop: https://podman-desktop.io"
      echo "  Download Docker Desktop: https://www.docker.com/products/docker-desktop"
      echo ""
    fi
    echo "  After installing, re-run:  ./scripts/0-preflight.sh"
    echo ""
  fi

  echo "========================================"
  echo ""
  exit 1
fi
