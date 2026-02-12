#!/bin/bash
# Open the MCP DevOps Lab dashboard in the default browser.
# Works on macOS (open) and Linux (xdg-open).
#
# Only opens the Chat UI dashboard — all other service links and API docs
# are accessible as clickable hyperlinks from within the dashboard itself.
# This prevents tab-spam on re-runs.

if command -v open &> /dev/null; then
  OPENER="open"
elif command -v xdg-open &> /dev/null; then
  OPENER="xdg-open"
else
  echo "Could not detect a browser opener (open / xdg-open)."
  echo "Open the dashboard manually:"
  echo ""
  echo "  http://localhost:3001"
  exit 1
fi

echo "Opening MCP DevOps Lab dashboard..."
$OPENER "http://localhost:3001"
echo "Done — dashboard opened at http://localhost:3001"
echo ""
echo "From the dashboard you can:"
echo "  • Browse all service endpoints as clickable links"
echo "  • Open API documentation pages for Phase 2"
echo "  • See the learning progression guide"
