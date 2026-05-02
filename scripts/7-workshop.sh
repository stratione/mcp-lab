#!/usr/bin/env bash
# MCP DevOps Lab — Workshop conductor.
#
# Single command for the presenter:
#   - run preflight checks (skippable with --skip-preflight)
#   - bring core lab up if not already healthy
#   - reset to seeded baseline if --reset is passed
#   - STOP all MCP servers (the workshop wizard opens on the cold-open state)
#   - open the Chat UI in workshop mode (?workshop=1)
#   - tail MCP logs in a side terminal
#
# Usage:
#   ./scripts/7-workshop.sh                  # full conductor flow
#   ./scripts/7-workshop.sh --reset          # call 8-reset.sh first
#   ./scripts/7-workshop.sh --skip-preflight # skip 0-preflight.sh
#   ./scripts/7-workshop.sh --dry-run        # print what would run, do nothing
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

DRY_RUN=false
DO_RESET=false
SKIP_PREFLIGHT=false
for arg in "$@"; do
  case "$arg" in
    --dry-run)        DRY_RUN=true ;;
    --reset)          DO_RESET=true ;;
    --skip-preflight) SKIP_PREFLIGHT=true ;;
    *) echo "Unknown flag: $arg"; exit 2 ;;
  esac
done

# Detect engine + compose binary the same way 1-setup.sh does.
if [ -f "$SCRIPT_DIR/_detect-engine.sh" ]; then
  source "$SCRIPT_DIR/_detect-engine.sh"
fi
COMPOSE="${COMPOSE:-docker compose}"
ENGINE="${ENGINE:-docker}"

run_or_print() {
  if $DRY_RUN; then
    echo "  [dry-run] would run: $*"
  else
    "$@"
  fi
}

echo "[1/5] Preflight checks..."
if $SKIP_PREFLIGHT; then
  echo "  Skipped (--skip-preflight)."
elif $DRY_RUN; then
  echo "  [dry-run] would run: $SCRIPT_DIR/0-preflight.sh"
else
  "$SCRIPT_DIR/0-preflight.sh"
fi

if $DO_RESET; then
  echo "[1.5/5] Resetting lab to seeded baseline..."
  if $DRY_RUN; then
    echo "  [dry-run] would run: $SCRIPT_DIR/8-reset.sh"
  else
    "$SCRIPT_DIR/8-reset.sh"
  fi
fi

echo "[2/5] Ensuring core lab is up..."
if curl -sf http://localhost:3001/health >/dev/null 2>&1; then
  echo "  Chat UI is already healthy."
else
  if $DRY_RUN; then
    echo "  [dry-run] would run: $SCRIPT_DIR/1-setup.sh"
  else
    "$SCRIPT_DIR/1-setup.sh"
  fi
fi

echo "[3/5] Stopping all MCP servers (workshop opens on cold-open state)..."
run_or_print $COMPOSE stop mcp-user mcp-gitea mcp-registry mcp-promotion mcp-runner

echo "[4/5] Opening Chat UI in workshop mode..."
WORKSHOP_URL="http://localhost:3001/?workshop=1"
if $DRY_RUN; then
  echo "  [dry-run] would open: $WORKSHOP_URL"
elif command -v open >/dev/null 2>&1; then
  open "$WORKSHOP_URL" || true
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$WORKSHOP_URL" >/dev/null 2>&1 || true
else
  echo "  Open this URL manually: $WORKSHOP_URL"
fi

echo "[5/5] Opening a Terminal window tailing MCP logs..."
if $DRY_RUN; then
  echo "  [dry-run] would launch terminal: $COMPOSE logs -f mcp-user mcp-gitea mcp-registry mcp-promotion mcp-runner"
elif [[ "$(uname -s)" == "Darwin" ]]; then
  osascript <<EOF
tell application "Terminal"
  activate
  do script "cd $PROJECT_DIR && $COMPOSE logs -f mcp-user mcp-gitea mcp-registry mcp-promotion mcp-runner"
end tell
EOF
elif command -v gnome-terminal >/dev/null 2>&1; then
  gnome-terminal -- bash -c "cd $PROJECT_DIR && $COMPOSE logs -f mcp-user mcp-gitea mcp-registry mcp-promotion mcp-runner; exec bash" &
elif command -v konsole >/dev/null 2>&1; then
  konsole -e bash -c "cd $PROJECT_DIR && $COMPOSE logs -f mcp-user mcp-gitea mcp-registry mcp-promotion mcp-runner; exec bash" &
else
  echo "  (no terminal opener found — run manually: $COMPOSE logs -f mcp-...)"
fi

echo ""
echo "================================================================"
echo "  Workshop ready. Have a great talk!"
echo "  Reset between sessions:  ./scripts/7-workshop.sh --reset"
echo "================================================================"
