#!/bin/bash
# Optional: expose MCP server via tunnel for remote LLM access
# Supports ngrok or cloudflare (cloudflared)

PORT="${1:-8003}"

if command -v ngrok &> /dev/null; then
  echo "Starting ngrok tunnel on port $PORT..."
  echo "The public URL will be displayed below."
  echo "Use this URL as your MCP server endpoint for remote clients."
  echo ""
  ngrok http "$PORT"
elif command -v cloudflared &> /dev/null; then
  echo "Starting Cloudflare tunnel on port $PORT..."
  echo "The public URL will be displayed below."
  echo "Use this URL as your MCP server endpoint for remote clients."
  echo ""
  cloudflared tunnel --url "http://localhost:$PORT"
else
  echo "ERROR: Neither ngrok nor cloudflared found."
  echo ""
  echo "Install one of:"
  echo "  ngrok:       https://ngrok.com/download"
  echo "  cloudflared: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/"
  echo ""
  echo "Or manually expose port $PORT to the internet."
  exit 1
fi
