#!/bin/bash
# Shared container-engine detection for all lab scripts.
# Source this file — it sets ENGINE and COMPOSE variables.
#
# Behavior:
#   1. If .engine exists in the project root, reuse that choice.
#   2. If only one engine is available, use it.
#   3. If both Docker and Podman are available, prompt the user to choose
#      and persist the answer in .engine for future runs.
#
# Usage:
#   SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
#   source "$SCRIPT_DIR/_detect-engine.sh"
#   # Now use $ENGINE and $COMPOSE

_DETECT_PROJECT_DIR="$(dirname "${SCRIPT_DIR:-$(cd "$(dirname "$0")" && pwd)}")"
_ENGINE_FILE="$_DETECT_PROJECT_DIR/.engine"

_podman_available=false
_docker_available=false

if command -v podman &>/dev/null && podman info &>/dev/null 2>&1; then
  _podman_available=true
fi

if command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
  _docker_available=true
fi

# ── 1. Check saved preference ────────────────────────────────────────────────
if [ -f "$_ENGINE_FILE" ]; then
  _saved="$(cat "$_ENGINE_FILE" | tr -d '[:space:]')"
  case "$_saved" in
    podman)
      if $_podman_available; then
        ENGINE="podman"
        COMPOSE="podman compose"
        return 0 2>/dev/null || true
      else
        echo "WARNING: Saved engine preference is 'podman' but Podman is not available."
        echo "         Re-detecting..."
        rm -f "$_ENGINE_FILE"
      fi
      ;;
    docker)
      if $_docker_available; then
        ENGINE="docker"
        COMPOSE="docker compose"
        return 0 2>/dev/null || true
      else
        echo "WARNING: Saved engine preference is 'docker' but Docker is not available."
        echo "         Re-detecting..."
        rm -f "$_ENGINE_FILE"
      fi
      ;;
    *)
      echo "WARNING: Unknown engine '$_saved' in .engine file. Re-detecting..."
      rm -f "$_ENGINE_FILE"
      ;;
  esac
fi

# ── 2. Detect available engines ──────────────────────────────────────────────
if $_podman_available && $_docker_available; then
  # Both available — ask the user
  echo ""
  echo "  Both Docker and Podman are available on this machine."
  echo ""
  echo "    1) Docker"
  echo "    2) Podman"
  echo ""
  while true; do
    printf "  Which container engine would you like to use? [1/2]: "
    read -r _choice || _choice=""
    case "$_choice" in
      1|docker|Docker)
        ENGINE="docker"
        COMPOSE="docker compose"
        break
        ;;
      2|podman|Podman)
        ENGINE="podman"
        COMPOSE="podman compose"
        break
        ;;
      *)
        echo "  Please enter 1 (Docker) or 2 (Podman)."
        ;;
    esac
  done

  # Persist the choice
  echo "$ENGINE" > "$_ENGINE_FILE"
  echo ""
  echo "  Using $ENGINE (saved to .engine — delete this file to choose again)."
  echo ""

elif $_podman_available; then
  ENGINE="podman"
  COMPOSE="podman compose"

elif $_docker_available; then
  ENGINE="docker"
  COMPOSE="docker compose"

else
  echo "ERROR: Neither Podman nor Docker is running."
  echo "  Run ./scripts/0-preflight.sh for install instructions."
  exit 1
fi
