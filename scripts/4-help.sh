#!/bin/bash
# Print MCP DevOps Lab quick reference (same info shown after bootstrap)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/_detect-engine.sh"

cat <<EOF
========================================================

  MCP DevOps Lab — Quick Reference

========================================================

  Services & URLs
  ────────────────────────────────────────────────────

  Chat UI              http://localhost:3001
  Gitea (Git hosting)  http://localhost:3000
  User API health      http://localhost:8001/health
  Promotion health     http://localhost:8002/health
  Registry Dev         http://localhost:5001/v2/_catalog
  Registry Prod        http://localhost:5002/v2/_catalog

  MCP Servers
  ────────────────────────────────────────────────────

  mcp-user               http://localhost:8003/mcp  6 tools
  mcp-gitea              http://localhost:8004/mcp  7 tools
  mcp-registry           http://localhost:8005/mcp  3 tools
  mcp-promotion          http://localhost:8006/mcp  3 tools

  Credentials
  ────────────────────────────────────────────────────

  Gitea admin:  mcpadmin / mcpadmin123

  Getting Started
  ────────────────────────────────────────────────────

  1. Navigate to:  http://localhost:3001
     The dashboard opens automatically and shows all service links,
     API docs, and the three-phase learning progression.
  2. All MCP servers start OFF by default.
  3. Enable MCP servers one at a time as you progress:

     $COMPOSE up -d mcp-user        # +6 user tools
     $COMPOSE up -d mcp-gitea       # +7 git/repo tools
     $COMPOSE up -d mcp-registry    # +3 registry tools
     $COMPOSE up -d mcp-promotion   # +3 promotion tools

  4. To stop an MCP server:

     $COMPOSE stop mcp-user

  5. Check what's running:

     $COMPOSE ps
     curl http://localhost:3001/api/tools

  User Roles
  ────────────────────────────────────────────────────

  Available roles: admin, dev, viewer

  Scripts
  ────────────────────────────────────────────────────

  ./scripts/0-preflight.sh          Check system requirements
  ./scripts/1-setup.sh              First-time setup
  ./scripts/2-restart-lab.sh        Rebuild + restart core services after changes
  ./scripts/2-restart-lab.sh --full Same + restart Gitea and registries too
  ./scripts/3-open-api-docs.sh      Open API docs in browser (Phase 2)
  ./scripts/4-help.sh               Show this help
  ./scripts/5-teardown.sh           Full cleanup (removes everything)
  ./scripts/6-tunnel.sh [port]      Expose MCP server via tunnel

========================================================
EOF
