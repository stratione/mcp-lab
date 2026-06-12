#!/bin/sh
# Initialize Gitea: create admin user, API token, sample repo

GITEA_URL="http://gitea:3000"
ADMIN_USER="mcpadmin"
ADMIN_PASS="mcpadmin123"
ADMIN_EMAIL="mcpadmin@lab.local"

echo "  [1/6] Creating admin user..."
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

echo "  [2/6] Creating API token..."
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

echo "  [3/6] Creating sample-app repository..."
curl -sf -X POST "$GITEA_URL/api/v1/user/repos" \
  -u "$ADMIN_USER:$ADMIN_PASS" \
  -H "Content-Type: application/json" \
  -d '{"name":"sample-app","description":"Sample application for MCP lab","auto_init":true,"default_branch":"main"}' \
  > /dev/null 2>&1 || echo "    Repo may already exist (OK)"

echo "  [4/6] Adding app.py and Dockerfile to sample-app..."

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
  # Alpine base scans clean (0 critical/0 high) so the seeded image passes the
  # promotion gate out of the box; the `vulnerable-base` drill introduces CVEs.
  DOCKERFILE_CONTENT=$(printf 'FROM python:3.12-alpine\nLABEL maintainer="mcp-lab"\nWORKDIR /app\nCOPY app.py .\nEXPOSE 8080\nCMD ["python", "app.py"]' | base64 | tr -d '\n')
  curl -sf -X POST "$GITEA_URL/api/v1/repos/$ADMIN_USER/sample-app/contents/Dockerfile" \
    -u "$ADMIN_USER:$ADMIN_PASS" \
    -H "Content-Type: application/json" \
    -d "{\"content\":\"$DOCKERFILE_CONTENT\",\"message\":\"Add Dockerfile\"}" \
    > /dev/null 2>&1 && echo "    Dockerfile added" || echo "    Could not add Dockerfile"
else
  echo "    Dockerfile already exists (OK)"
fi

echo "  [5/6] Registering chat-ui pipeline webhook on sample-app..."
# Feeds the Pipeline Board's live event feed (POST /api/events/gitea on
# chat-ui). Idempotent: skip if a hook already points at that URL. In the
# CLI edition chat-ui is absent — Gitea still accepts the hook and simply
# fails deliveries, which is harmless.
WEBHOOK_URL="http://chat-ui:3001/api/events/gitea"
EXISTING_HOOK=$(curl -sf "$GITEA_URL/api/v1/repos/$ADMIN_USER/sample-app/hooks" \
  -u "$ADMIN_USER:$ADMIN_PASS" 2>/dev/null \
  | jq -r --arg url "$WEBHOOK_URL" '.[] | select(.config.url == $url) | .id' | head -1)

if [ -n "$EXISTING_HOOK" ]; then
  echo "    Webhook already registered (OK)"
else
  curl -sf -X POST "$GITEA_URL/api/v1/repos/$ADMIN_USER/sample-app/hooks" \
    -u "$ADMIN_USER:$ADMIN_PASS" \
    -H "Content-Type: application/json" \
    -d "{\"type\":\"gitea\",\"active\":true,\"events\":[\"push\",\"create\",\"delete\"],\"config\":{\"url\":\"$WEBHOOK_URL\",\"content_type\":\"json\"}}" \
    > /dev/null 2>&1 && echo "    Webhook registered -> $WEBHOOK_URL" \
    || echo "    Could not register webhook"
fi

echo "  [6/6] Seeding workshop demo users..."
# These extra users power the "MCP can act on your behalf" demo. Workshop
# attendees can pass username + password to any gitea_* tool and watch
# the resulting commit/repo show up under that identity in Gitea.
# Passwords are intentionally memorable (lab-only, no secrets).
for entry in "diana:diana-lab-123:diana@lab.local" "bob:bob-lab-123:bob@lab.local" "alice:alice-lab-123:alice@lab.local"; do
  USER_NAME="${entry%%:*}"
  REST="${entry#*:}"
  USER_PASS="${REST%%:*}"
  USER_EMAIL="${entry##*:}"
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -u "$USER_NAME:$USER_PASS" "$GITEA_URL/api/v1/user" 2>/dev/null)
  if [ "$STATUS" = "200" ]; then
    echo "    $USER_NAME already exists (OK)"
  else
    curl -sf -X POST "$GITEA_URL/api/v1/admin/users" \
      -u "$ADMIN_USER:$ADMIN_PASS" \
      -H "Content-Type: application/json" \
      -d "{\"username\":\"$USER_NAME\",\"password\":\"$USER_PASS\",\"email\":\"$USER_EMAIL\",\"must_change_password\":false}" \
      > /dev/null 2>&1 && echo "    $USER_NAME created (password: $USER_PASS)" \
      || echo "    Could not create $USER_NAME"
  fi
done

echo "  Gitea initialization complete."
