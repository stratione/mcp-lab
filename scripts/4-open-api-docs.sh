#!/bin/bash
# Open only API docs URLs in the default browser.
# Works on macOS (open) and Linux (xdg-open).

if command -v open &> /dev/null; then
  OPENER="open"
elif command -v xdg-open &> /dev/null; then
  OPENER="xdg-open"
else
  echo "Could not detect a browser opener (open / xdg-open)."
  echo "Open these docs URLs manually:"
  echo ""
  echo "  http://localhost:3000/api/swagger"
  echo "  http://localhost:8001/docs"
  echo "  http://localhost:8002/docs"
  exit 1
fi

echo "Opening API docs URLs in your browser..."

$OPENER "http://localhost:3000/api/swagger"  # Gitea Swagger
$OPENER "http://localhost:8001/docs"         # User API Swagger
$OPENER "http://localhost:8002/docs"         # Promotion Service Swagger

echo "Done — 3 API docs tabs opened."
