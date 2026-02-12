#!/bin/sh
# Seed the dev registry with sample images using the Registry v2 API.
# Runs inside the bootstrap container on the mcp-lab-net network.

REGISTRY="http://registry-dev:5000"

# ── Images to seed ───────────────────────────────────────────────
# Format: image:tag:content
IMAGES="
sample-app:v1.0.0:Hello from sample-app v1.0.0
sample-app:v1.1.0:Hello from sample-app v1.1.0 - added logging
web-frontend:v2.3.1:React frontend build artifacts
auth-service:v1.0.0:Authentication microservice
data-pipeline:v0.9.0:ETL pipeline - beta release
"

push_image() {
  local IMAGE="$1"
  local TAG="$2"
  local CONTENT="$3"

  # Check if image already exists
  EXISTING=$(curl -sf "$REGISTRY/v2/$IMAGE/tags/list" 2>/dev/null | jq -r ".tags[]? // empty" 2>/dev/null | grep -c "^${TAG}$" || true)
  if [ "$EXISTING" != "0" ]; then
    echo "    $IMAGE:$TAG already exists (skip)"
    return 0
  fi

  # --- 1. Create a minimal layer ---
  rm -rf /tmp/registry-seed
  mkdir -p /tmp/registry-seed
  echo "$CONTENT" > /tmp/registry-seed/hello.txt
  tar czf /tmp/layer.tar.gz -C /tmp/registry-seed .

  LAYER_SIZE=$(wc -c < /tmp/layer.tar.gz | tr -d ' ')
  LAYER_DIGEST="sha256:$(sha256sum /tmp/layer.tar.gz | cut -d' ' -f1)"

  # --- 2. Upload layer blob ---
  curl -sf -X POST "$REGISTRY/v2/$IMAGE/blobs/uploads/" \
    -D /tmp/upload_headers -o /dev/null 2>&1
  UPLOAD_URL=$(grep -i '^location:' /tmp/upload_headers | tr -d '\r' | sed 's/^[Ll]ocation: *//')

  case "$UPLOAD_URL" in
    http*) ;;
    *)     UPLOAD_URL="${REGISTRY}${UPLOAD_URL}" ;;
  esac

  case "$UPLOAD_URL" in
    *\?*) UPLOAD_URL="${UPLOAD_URL}&digest=${LAYER_DIGEST}" ;;
    *)    UPLOAD_URL="${UPLOAD_URL}?digest=${LAYER_DIGEST}" ;;
  esac

  curl -sf -X PUT "$UPLOAD_URL" \
    -H "Content-Type: application/octet-stream" \
    --data-binary @/tmp/layer.tar.gz > /dev/null 2>&1

  # --- 3. Create config blob ---
  cat > /tmp/config.json <<CFGEOF
{"architecture":"amd64","os":"linux","config":{"Labels":{"maintainer":"mcp-lab","app":"${IMAGE}","version":"${TAG}"}},"rootfs":{"type":"layers","diff_ids":["${LAYER_DIGEST}"]}}
CFGEOF

  CONFIG_SIZE=$(wc -c < /tmp/config.json | tr -d ' ')
  CONFIG_DIGEST="sha256:$(sha256sum /tmp/config.json | cut -d' ' -f1)"

  # --- 4. Upload config blob ---
  curl -sf -X POST "$REGISTRY/v2/$IMAGE/blobs/uploads/" \
    -D /tmp/upload_headers2 -o /dev/null 2>&1
  UPLOAD_URL=$(grep -i '^location:' /tmp/upload_headers2 | tr -d '\r' | sed 's/^[Ll]ocation: *//')

  case "$UPLOAD_URL" in
    http*) ;;
    *)     UPLOAD_URL="${REGISTRY}${UPLOAD_URL}" ;;
  esac

  case "$UPLOAD_URL" in
    *\?*) UPLOAD_URL="${UPLOAD_URL}&digest=${CONFIG_DIGEST}" ;;
    *)    UPLOAD_URL="${UPLOAD_URL}?digest=${CONFIG_DIGEST}" ;;
  esac

  curl -sf -X PUT "$UPLOAD_URL" \
    -H "Content-Type: application/octet-stream" \
    --data-binary @/tmp/config.json > /dev/null 2>&1

  # --- 5. Push manifest ---
  cat > /tmp/manifest.json <<MFEOF
{
  "schemaVersion": 2,
  "mediaType": "application/vnd.docker.distribution.manifest.v2+json",
  "config": {
    "mediaType": "application/vnd.docker.container.image.v1+json",
    "size": ${CONFIG_SIZE},
    "digest": "${CONFIG_DIGEST}"
  },
  "layers": [
    {
      "mediaType": "application/vnd.docker.image.rootfs.diff.tar.gzip",
      "size": ${LAYER_SIZE},
      "digest": "${LAYER_DIGEST}"
    }
  ]
}
MFEOF

  HTTP_CODE=$(curl -sf -X PUT "$REGISTRY/v2/$IMAGE/manifests/$TAG" \
    -H "Content-Type: application/vnd.docker.distribution.manifest.v2+json" \
    -d @/tmp/manifest.json -o /dev/null -w "%{http_code}" 2>&1)

  if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "200" ]; then
    echo "    $IMAGE:$TAG pushed"
  else
    echo "    WARNING: Could not push $IMAGE:$TAG (HTTP $HTTP_CODE)"
  fi

  # Clean up temp files
  rm -f /tmp/layer.tar.gz /tmp/config.json /tmp/manifest.json /tmp/upload_headers /tmp/upload_headers2
  rm -rf /tmp/registry-seed
}

# ── Push all images ──────────────────────────────────────────────
echo "$IMAGES" | while IFS=: read -r IMAGE TAG CONTENT; do
  # Skip blank lines
  [ -z "$IMAGE" ] && continue
  push_image "$IMAGE" "$TAG" "$CONTENT"
done
