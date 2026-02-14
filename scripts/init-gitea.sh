#!/bin/sh
# Initialize Gitea: create admin user, API token, sample repo

GITEA_URL="http://gitea:3000"
ADMIN_USER="mcpadmin"
ADMIN_PASS="mcpadmin123"
ADMIN_EMAIL="mcpadmin@lab.local"

echo "  [1/4] Creating admin user..."
# Use basic auth to test if user exists already
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -u "$ADMIN_USER:$ADMIN_PASS" "$GITEA_URL/api/v1/user" 2>/dev/null)
if [ "$STATUS" = "200" ]; then
  echo "    Admin user already exists (OK)"
else
  # Create via Gitea registration form (first user gets admin)
  curl -sf -X POST "$GITEA_URL/user/sign_up" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "user_name=$ADMIN_USER&password=$ADMIN_PASS&retype=$ADMIN_PASS&email=$ADMIN_EMAIL" \
    > /dev/null 2>&1 || echo "    Registration form method failed, user may need manual creation"
fi

echo "  [2/4] Creating API token..."
# Delete existing token if any
curl -sf -X DELETE "$GITEA_URL/api/v1/users/$ADMIN_USER/tokens/mcp-lab-token" \
  -u "$ADMIN_USER:$ADMIN_PASS" > /dev/null 2>&1 || true

TOKEN_RESP=$(curl -sf -X POST "$GITEA_URL/api/v1/users/$ADMIN_USER/tokens" \
  -u "$ADMIN_USER:$ADMIN_PASS" \
  -H "Content-Type: application/json" \
  -d '{"name":"mcp-lab-token","scopes":["all"]}' 2>/dev/null || echo "{}")

TOKEN=$(echo "$TOKEN_RESP" | jq -r '.sha1 // empty')

if [ -n "$TOKEN" ]; then
  echo "    Token created: ${TOKEN}"
  echo ""
  echo "  *** IMPORTANT: Copy this token to your .env file as GITEA_TOKEN ***"
  echo "  GITEA_TOKEN=$TOKEN"
  echo ""
else
  echo "    WARNING: Could not create Gitea API token."
  echo "    You may need to create the admin user manually:"
  echo "    docker compose exec -u git gitea gitea admin user create --admin --username mcpadmin --password mcpadmin123 --email mcpadmin@lab.local --must-change-password=false"
fi

echo "  [3/4] Creating sample-app repository..."
curl -sf -X POST "$GITEA_URL/api/v1/user/repos" \
  -u "$ADMIN_USER:$ADMIN_PASS" \
  -H "Content-Type: application/json" \
  -d '{"name":"sample-app","description":"Sample application for MCP lab","auto_init":true,"default_branch":"main"}' \
  > /dev/null 2>&1 || echo "    Repo may already exist (OK)"

echo "  [4/4] Adding app.py and Dockerfile to sample-app..."

# --- app.py ---
EXISTS=$(curl -sf "$GITEA_URL/api/v1/repos/$ADMIN_USER/sample-app/contents/app.py" \
  -u "$ADMIN_USER:$ADMIN_PASS" 2>/dev/null | jq -r '.name // empty')

if [ -z "$EXISTS" ]; then
  APP_PY_CONTENT=$(cat <<'PYEOF'
"""Minimal Hello World HTTP server for MCP Lab pipeline demos."""

import json
from http.server import HTTPServer, BaseHTTPRequestHandler

VERSION = "1.0.0"


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            body = {"status": "ok"}
        elif self.path == "/":
            body = {"message": "Hello from MCP Lab!", "version": VERSION}
        else:
            self.send_response(404)
            self.end_headers()
            return

        payload = json.dumps(body).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format, *args):
        pass


if __name__ == "__main__":
    server = HTTPServer(("0.0.0.0", 8080), Handler)
    print(f"hello-app v{VERSION} listening on :8080")
    server.serve_forever()
PYEOF
  )
  APP_PY_B64=$(printf '%s' "$APP_PY_CONTENT" | base64 | tr -d '\n')
  curl -sf -X POST "$GITEA_URL/api/v1/repos/$ADMIN_USER/sample-app/contents/app.py" \
    -u "$ADMIN_USER:$ADMIN_PASS" \
    -H "Content-Type: application/json" \
    -d "{\"content\":\"$APP_PY_B64\",\"message\":\"Add app.py\"}" \
    > /dev/null 2>&1 && echo "    app.py added" || echo "    Could not add app.py"
else
  echo "    app.py already exists (OK)"
fi

# --- Dockerfile ---
EXISTS=$(curl -sf "$GITEA_URL/api/v1/repos/$ADMIN_USER/sample-app/contents/Dockerfile" \
  -u "$ADMIN_USER:$ADMIN_PASS" 2>/dev/null | jq -r '.name // empty')

if [ -z "$EXISTS" ]; then
  DOCKERFILE_CONTENT=$(printf 'FROM python:3.12-slim\nLABEL maintainer="mcp-lab"\nWORKDIR /app\nCOPY app.py .\nEXPOSE 8080\nCMD ["python", "app.py"]' | base64 | tr -d '\n')
  curl -sf -X POST "$GITEA_URL/api/v1/repos/$ADMIN_USER/sample-app/contents/Dockerfile" \
    -u "$ADMIN_USER:$ADMIN_PASS" \
    -H "Content-Type: application/json" \
    -d "{\"content\":\"$DOCKERFILE_CONTENT\",\"message\":\"Add Dockerfile\"}" \
    > /dev/null 2>&1 && echo "    Dockerfile added" || echo "    Could not add Dockerfile"
else
  echo "    Dockerfile already exists (OK)"
fi

echo "  Gitea initialization complete."
