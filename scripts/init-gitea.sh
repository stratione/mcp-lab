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
  echo "    podman compose exec -u git gitea gitea admin user create --admin --username mcpadmin --password mcpadmin123 --email mcpadmin@lab.local --must-change-password=false"
fi

echo "  [3/4] Creating sample-app repository..."
curl -sf -X POST "$GITEA_URL/api/v1/user/repos" \
  -u "$ADMIN_USER:$ADMIN_PASS" \
  -H "Content-Type: application/json" \
  -d '{"name":"sample-app","description":"Sample application for MCP lab","auto_init":true,"default_branch":"main"}' \
  > /dev/null 2>&1 || echo "    Repo may already exist (OK)"

echo "  [4/4] Adding Dockerfile to sample-app..."
EXISTS=$(curl -sf "$GITEA_URL/api/v1/repos/$ADMIN_USER/sample-app/contents/Dockerfile" \
  -u "$ADMIN_USER:$ADMIN_PASS" 2>/dev/null | jq -r '.name // empty')

if [ -z "$EXISTS" ]; then
  DOCKERFILE_CONTENT=$(printf 'FROM alpine:3.19\nLABEL maintainer="mcp-lab"\nCMD ["echo", "Hello from sample-app"]' | base64 | tr -d '\n')
  curl -sf -X POST "$GITEA_URL/api/v1/repos/$ADMIN_USER/sample-app/contents/Dockerfile" \
    -u "$ADMIN_USER:$ADMIN_PASS" \
    -H "Content-Type: application/json" \
    -d "{\"content\":\"$DOCKERFILE_CONTENT\",\"message\":\"Add Dockerfile\"}" \
    > /dev/null 2>&1 && echo "    Dockerfile added" || echo "    Could not add Dockerfile"
else
  echo "    Dockerfile already exists (OK)"
fi

echo "  Gitea initialization complete."
