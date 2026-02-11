#!/bin/sh
# Seed the dev registry with a sample image using the Registry v2 API.
# Runs inside the bootstrap container on the mcp-lab-net network.

REGISTRY="http://registry-dev:5000"
IMAGE="sample-app"
TAG="v1.0.0"

echo "  Pushing $IMAGE:$TAG to dev registry..."

# Check if image already exists
EXISTING=$(curl -sf "$REGISTRY/v2/$IMAGE/tags/list" 2>/dev/null | jq -r ".tags[]? // empty" 2>/dev/null | grep -c "^${TAG}$" || true)
if [ "$EXISTING" != "0" ]; then
  echo "    $IMAGE:$TAG already exists in dev registry (OK)"
  exit 0
fi

# --- 1. Create a minimal layer ---
mkdir -p /tmp/registry-seed
echo "Hello from sample-app" > /tmp/registry-seed/hello.txt
tar czf /tmp/layer.tar.gz -C /tmp/registry-seed .

LAYER_SIZE=$(wc -c < /tmp/layer.tar.gz | tr -d ' ')
LAYER_DIGEST="sha256:$(sha256sum /tmp/layer.tar.gz | cut -d' ' -f1)"

# --- 2. Upload layer blob ---
curl -sf -X POST "$REGISTRY/v2/$IMAGE/blobs/uploads/" \
  -D /tmp/upload_headers -o /dev/null 2>&1
UPLOAD_URL=$(grep -i '^location:' /tmp/upload_headers | tr -d '\r' | sed 's/^[Ll]ocation: *//')

# Handle relative URLs
case "$UPLOAD_URL" in
  http*) ;;
  *)     UPLOAD_URL="${REGISTRY}${UPLOAD_URL}" ;;
esac

# Append digest
case "$UPLOAD_URL" in
  *\?*) UPLOAD_URL="${UPLOAD_URL}&digest=${LAYER_DIGEST}" ;;
  *)    UPLOAD_URL="${UPLOAD_URL}?digest=${LAYER_DIGEST}" ;;
esac

curl -sf -X PUT "$UPLOAD_URL" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @/tmp/layer.tar.gz > /dev/null 2>&1

# --- 3. Create config blob ---
cat > /tmp/config.json <<CFGEOF
{"architecture":"amd64","os":"linux","config":{"Labels":{"maintainer":"mcp-lab"}},"rootfs":{"type":"layers","diff_ids":["${LAYER_DIGEST}"]}}
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
  echo "    $IMAGE:$TAG pushed to dev registry"
else
  echo "    WARNING: Could not push $IMAGE:$TAG (HTTP $HTTP_CODE)"
  echo "    You can push manually from the host:"
  echo "      podman pull alpine:3.19"
  echo "      podman tag alpine:3.19 localhost:5001/$IMAGE:$TAG"
  echo "      podman push localhost:5001/$IMAGE:$TAG"
fi

# Clean up
rm -rf /tmp/registry-seed /tmp/layer.tar.gz /tmp/config.json /tmp/manifest.json /tmp/upload_headers /tmp/upload_headers2
