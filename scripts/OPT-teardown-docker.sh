#!/bin/bash
# MCP DevOps Lab — Full teardown (Docker)
# Stops the lab and removes lab containers, images, networks, and volumes.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-$(basename "$PROJECT_DIR")}"

echo "========================================"
echo "  MCP DevOps Lab — Teardown (Docker)"
echo "========================================"
echo ""

cd "$PROJECT_DIR"

echo "[1/5] Bringing stack down (containers, volumes, images)..."
docker compose down -v --remove-orphans --rmi all || true

echo "[2/5] Removing leftover lab containers..."
LEFTOVER_CONTAINERS="$(docker ps -a --format '{{.Names}}' | rg "^${PROJECT_NAME}[-_]" || true)"
if [ -n "$LEFTOVER_CONTAINERS" ]; then
  while IFS= read -r c; do
    [ -n "$c" ] && docker rm -f "$c" >/dev/null 2>&1 || true
  done <<< "$LEFTOVER_CONTAINERS"
  echo "    Removed leftover containers."
else
  echo "    No leftover containers found."
fi

echo "[3/5] Removing leftover lab images..."
LEFTOVER_IMAGES="$(
  docker images --format '{{.Repository}}:{{.Tag}}' \
    | rg "(^|/)${PROJECT_NAME}-|^localhost:5001/sample-app:|^localhost:5002/sample-app:" \
    || true
)"
if [ -n "$LEFTOVER_IMAGES" ]; then
  while IFS= read -r img; do
    [ -n "$img" ] && docker rmi -f "$img" >/dev/null 2>&1 || true
  done <<< "$LEFTOVER_IMAGES"
  echo "    Removed leftover images."
else
  echo "    No leftover images found."
fi

echo "[4/5] Removing leftover lab volumes..."
LEFTOVER_VOLUMES="$(docker volume ls --filter "label=com.docker.compose.project=${PROJECT_NAME}" --format '{{.Name}}' || true)"
if [ -n "$LEFTOVER_VOLUMES" ]; then
  while IFS= read -r vol; do
    [ -n "$vol" ] && docker volume rm "$vol" >/dev/null 2>&1 || true
  done <<< "$LEFTOVER_VOLUMES"
  echo "    Removed leftover volumes."
else
  echo "    No leftover volumes found."
fi

echo "[5/5] Removing leftover lab networks..."
LEFTOVER_NETWORKS="$(docker network ls --filter "label=com.docker.compose.project=${PROJECT_NAME}" --format '{{.Name}}' || true)"
if [ -n "$LEFTOVER_NETWORKS" ]; then
  while IFS= read -r net; do
    [ -n "$net" ] && docker network rm "$net" >/dev/null 2>&1 || true
  done <<< "$LEFTOVER_NETWORKS"
  echo "    Removed leftover networks."
else
  echo "    No leftover networks found."
fi

echo ""
echo "========================================"
echo "  Docker Teardown Complete"
echo "========================================"
