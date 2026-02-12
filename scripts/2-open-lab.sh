#!/bin/bash
# Open all MCP DevOps Lab URLs in the default browser.
# Works on macOS (open) and Linux (xdg-open).

if command -v open &> /dev/null; then
  OPENER="open"
elif command -v xdg-open &> /dev/null; then
  OPENER="xdg-open"
else
  echo "Could not detect a browser opener (open / xdg-open)."
  echo "Open these URLs manually:"
  echo ""
  echo "  http://localhost:3001"
  echo "  http://localhost:3000"
  echo "  http://localhost:8001/health"
  echo "  http://localhost:8002/health"
  echo "  http://localhost:5001/v2/_catalog"
  echo "  http://localhost:5002/v2/_catalog"
  exit 1
fi

echo "Opening lab URLs in your browser..."

$OPENER "http://localhost:3001"          # Chat UI
$OPENER "http://localhost:3000"          # Gitea
$OPENER "http://localhost:8001/health"   # User API health
$OPENER "http://localhost:8002/health"   # Promotion Service health
$OPENER "http://localhost:5001/v2/_catalog"  # Registry Dev
$OPENER "http://localhost:5002/v2/_catalog"  # Registry Prod

echo "Done — 6 tabs opened (no API docs tabs)."
