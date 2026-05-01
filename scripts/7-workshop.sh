#!/usr/bin/env bash
# MCP DevOps Lab — Workshop launcher (Milestone 6).
#
# One command for the presenter to start the talk:
#   - bring the lab up if it isn't already
#   - start all 5 MCP servers
#   - open Chat UI tab + dashboard tab in the default browser
#   - open a Terminal window tailing the MCP logs (audience visibility)
#
# Usage:
#   ./scripts/7-workshop.sh             # bring up + open windows
#   ./scripts/7-workshop.sh --reset     # call scripts/8-reset.sh first
#   ./scripts/7-workshop.sh --dry-run   # print what would happen, do nothing
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

DRY_RUN=false
DO_RESET=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --reset)   DO_RESET=true ;;
    *) echo "Unknown flag: $arg"; exit 2 ;;
  esac
done

# Detect engine + compose binary the same way 1-setup.sh does.
if [ -x "$SCRIPT_DIR/_detect-engine.sh" ]; then
  source "$SCRIPT_DIR/_detect-engine.sh"
fi
COMPOSE="${COMPOSE:-podman compose}"
ENGINE="${ENGINE:-podman}"

run_or_print() {
  if $DRY_RUN; then
    echo "  [dry-run] would run: $*"
  else
    "$@"
  fi
}

if $DO_RESET; then
  if $DRY_RUN; then
    echo "[0/4] [dry-run] would call $SCRIPT_DIR/8-reset.sh"
  else
    "$SCRIPT_DIR/8-reset.sh"
  fi
fi

echo "[1/4] Ensuring core lab is up..."
if curl -sf http://localhost:3001/health >/dev/null 2>&1; then
  echo "  Chat UI is already healthy."
else
  if $DRY_RUN; then
    echo "  [dry-run] would run: $SCRIPT_DIR/1-setup.sh"
  else
    "$SCRIPT_DIR/1-setup.sh"
  fi
fi

echo "[2/4] Bringing all 5 MCP servers up..."
run_or_print $COMPOSE up -d mcp-user mcp-gitea mcp-registry mcp-promotion mcp-runner

echo "[3/4] Opening browser tabs (Chat UI + Dashboard)..."
if $DRY_RUN; then
  echo "  [dry-run] would open: http://localhost:3001"
  echo "  [dry-run] would open: http://localhost:3001/?dashboard=open"
elif command -v open >/dev/null 2>&1; then
  open "http://localhost:3001" || true
  sleep 1
  open "http://localhost:3001/?dashboard=open" || true
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://localhost:3001" >/dev/null 2>&1 || true
  sleep 1
  xdg-open "http://localhost:3001/?dashboard=open" >/dev/null 2>&1 || true
fi

echo "[4/4] Opening a Terminal window tailing MCP logs..."
if $DRY_RUN; then
  echo "  [dry-run] would launch Terminal tailing: $COMPOSE logs -f mcp-user mcp-gitea mcp-registry mcp-promotion mcp-runner"
elif [[ "$(uname -s)" == "Darwin" ]]; then
  osascript <<EOF
tell application "Terminal"
  activate
  do script "cd $PROJECT_DIR && $COMPOSE logs -f mcp-user mcp-gitea mcp-registry mcp-promotion mcp-runner"
end tell
EOF
else
  if command -v gnome-terminal >/dev/null 2>&1; then
    gnome-terminal -- bash -c "cd $PROJECT_DIR && $COMPOSE logs -f mcp-user mcp-gitea mcp-registry mcp-promotion mcp-runner; exec bash" &
  elif command -v konsole >/dev/null 2>&1; then
    konsole -e bash -c "cd $PROJECT_DIR && $COMPOSE logs -f mcp-user mcp-gitea mcp-registry mcp-promotion mcp-runner; exec bash" &
  else
    echo "  (no terminal opener found — run manually:  $COMPOSE logs -f mcp-...)"
  fi
fi

echo ""
echo "================================================================"
echo "  Workshop ready. Have a great talk!"
echo "  Reset between sessions:  ./scripts/8-reset.sh"
echo "  Or:                      ./scripts/7-workshop.sh --reset"
echo "================================================================"
