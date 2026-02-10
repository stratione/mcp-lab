#!/bin/sh
set -e

echo "========================================"
echo "  MCP DevOps Lab — Bootstrap"
echo "========================================"

apk add --no-cache curl jq > /dev/null 2>&1

# Wait for services
echo "[*] Waiting for services..."
for svc in "user-api:8001/health" "gitea:3000/api/v1/version"; do
  host=$(echo "$svc" | cut -d: -f1)
  path=$(echo "$svc" | cut -d: -f2-)
  echo "    Waiting for $host..."
  for i in $(seq 1 60); do
    if curl -sf "http://$host:$path" > /dev/null 2>&1; then
      echo "    $host is ready"
      break
    fi
    sleep 2
  done
done

# Run init scripts
echo "[*] Initializing Gitea..."
sh /scripts/init-gitea.sh

echo "[*] Seed registry info..."
sh /scripts/seed-registry.sh

echo ""
echo "========================================"
echo "  Bootstrap Complete!"
echo "========================================"
echo ""
echo "  Service Map:"
echo "    User API         http://localhost:8001"
echo "    Gitea            http://localhost:3000"
echo "    Registry (dev)   http://localhost:5001"
echo "    Registry (prod)  http://localhost:5002"
echo "    Promotion Svc    http://localhost:8002"
echo "    MCP Server       http://localhost:8003"
echo "    Chat UI          http://localhost:3001"
echo ""
echo "  Gitea admin: mcpadmin / mcpadmin123"
echo ""
echo "========================================"
