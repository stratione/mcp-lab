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

echo "[1.5/4] Pre-flight: verify the active provider is actually reachable..."
preflight_provider() {
  if ! command -v python3 >/dev/null 2>&1; then return 0; fi
  python3 - <<'PY' 2>/dev/null
import json, sys, urllib.request
try:
    d = json.loads(urllib.request.urlopen("http://localhost:3001/api/providers", timeout=3).read())
except Exception:
    sys.exit(0)
active = d.get("active", {})
provider = active.get("provider", "")
if provider == "ollama":
    try:
        urllib.request.urlopen("http://localhost:11434/api/version", timeout=2).read()
        print(f"  ✓ Ollama is the active provider and is reachable.")
    except Exception:
        print(f"  ⚠ Active provider is Ollama, but Ollama is NOT reachable on")
        print(f"    localhost:11434.  Run `ollama serve` in a separate terminal,")
        print(f"    or switch to Anthropic/OpenAI/Google in the Chat UI.")
        sys.exit(2)
elif provider in ("anthropic", "openai", "google"):
    if not active.get("has_key"):
        print(f"  ⚠ Active provider is {provider}, but no API key is set.")
        print(f"    Add the key to .env.secrets and restart chat-ui, or pick")
        print(f"    a different provider in the Chat UI settings panel.")
        sys.exit(2)
    print(f"  ✓ Active provider is {provider} and a key is set ({active.get('key_preview', '')}).")
elif provider == "pretend":
    print(f"  ✓ Active provider is the scripted Demo LLM (no key required).")
else:
    print(f"  ⚠ Unrecognized active provider: {provider!r}")
PY
}
if ! $DRY_RUN; then
  preflight_provider || echo "  (Continuing anyway — fix the warning above before demoing.)"
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
