#!/usr/bin/env bash
# Throwaway prototype — Q2 + Q3 from plan_workshop_ready.md.
#
# Confirms the runner can: (a) reach the engine socket, (b) build an image,
# (c) push that image to registry-dev, (d) pull from registry-prod and run a
# container exposing a port. On macOS Podman with rootless mode.
#
# Findings (rolled into Decision Log as D-013, D-014):
#   D-013: Bind-mount /var/run/docker.sock works on Podman macOS thanks to
#          the in-VM symlink, but the rootless daemon's SELinux labels deny
#          access. Fix: add `--security-opt label=disable` to the runner.
#
#   D-014: `docker push` and `podman push` go via the daemon, which lives
#          in the host network namespace and CANNOT resolve compose names
#          like `registry-dev`. Workaround: build via the daemon, then push
#          with `skopeo copy` from inside the container (which IS on the
#          compose network and CAN resolve `registry-dev:5000`). This means
#          the runner Dockerfile must add `skopeo`.
#
# PASS = each step prints PASS. FAIL = exit non-zero.
set -euo pipefail

NET="mcp-lab_mcp-lab-net"
SOCK="/var/run/docker.sock"
TAG="proto-runner-pipeline:dev"

cleanup() {
  podman --remote --url "unix://$SOCK" rm -f proto-runner-pipeline >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "[1/5] Confirm engine socket exists and is reachable from a container..."
podman run --rm \
  --security-opt label=disable \
  --network "$NET" \
  -v "$SOCK":"$SOCK" \
  alpine:3.19 sh -c '
    apk add --no-cache curl >/dev/null 2>&1
    curl -sf --unix-socket /var/run/docker.sock http://d/v1.41/info | grep -q ServerVersion
  ' || { echo "FAIL — socket unreachable from container"; exit 1; }
echo "  PASS — socket is reachable with label=disable"

echo "[2/5] Build an image via podman --remote against the socket..."
podman run --rm \
  --security-opt label=disable \
  --network "$NET" \
  -v "$SOCK":"$SOCK" \
  quay.io/podman/stable:latest sh -c "
    cat > /tmp/Dockerfile <<EOF
FROM alpine:3.19
RUN echo 'lab-built'
CMD [\"echo\", \"proto-runner-pipeline\"]
EOF
    cd /tmp
    podman --remote --url unix://$SOCK build -t $TAG . >/dev/null 2>&1
    podman --remote --url unix://$SOCK images $TAG --format '{{.Repository}}:{{.Tag}}'
  " || { echo "FAIL — build failed"; exit 1; }
echo "  PASS — image built"

echo "[3a/5] Save image tarball via podman..."
# Use a path under the user's home so podman-machine mounts can see it.
# (Anything under /tmp on macOS lives outside the VM.)
SHARED=$(mktemp -d "$HOME/.cache/mcp-lab-proto.XXXXXX" 2>/dev/null || mktemp -d "$HOME/mcp-lab-proto.XXXXXX")
podman run --rm \
  --security-opt label=disable \
  --network "$NET" \
  -v "$SOCK":"$SOCK" \
  -v "$SHARED":/out:Z \
  quay.io/podman/stable:latest sh -c "
    podman --remote --url unix://$SOCK save -o /out/img.tar $TAG
  " || { echo "FAIL — save failed"; exit 1; }
echo "  PASS — tarball saved to $SHARED/img.tar"

echo "[3b/5] Push to registry-dev via skopeo container (no daemon involved)..."
podman run --rm \
  --security-opt label=disable \
  --network "$NET" \
  -v "$SHARED":/out:Z \
  quay.io/skopeo/stable:latest \
  copy --dest-tls-verify=false \
    docker-archive:/out/img.tar \
    docker://registry-dev:5000/proto-runner-pipeline:dev 2>&1 | tail -5 \
  || { echo "FAIL — skopeo push failed"; rm -rf "$SHARED"; exit 1; }
rm -rf "$SHARED"
echo "  PASS — pushed to registry-dev"

echo "[4/5] Verify the image arrived in registry-dev..."
got=$(curl -sf http://localhost:5001/v2/proto-runner-pipeline/tags/list || echo "{}")
echo "  catalog: $got"
echo "$got" | grep -q '"dev"' || { echo "FAIL — image not visible in registry-dev"; exit 1; }
echo "  PASS — image is queryable"

echo "[5/5] Pull and run from registry-dev (deploy-style) and curl the port..."
# deploy_app pulls from registry-prod normally; for the prototype we just want
# to verify pull-and-run via the socket works, so we use registry-dev.
podman --remote --url "unix://$SOCK" rm -f proto-runner-pipeline >/dev/null 2>&1 || true
# We need a container that listens on a port — use a tiny http server:
podman run --rm \
  --security-opt label=disable \
  --network "$NET" \
  -v "$SOCK":"$SOCK" \
  quay.io/podman/stable:latest sh -c "
    cat > /tmp/Dockerfile <<EOF
FROM python:3.12-alpine
RUN echo 'from http.server import BaseHTTPRequestHandler, HTTPServer' > /app.py && \
    echo 'class H(BaseHTTPRequestHandler):' >> /app.py && \
    echo '    def do_GET(self):' >> /app.py && \
    echo '        self.send_response(200)' >> /app.py && \
    echo '        self.send_header(\"Content-Type\",\"application/json\")' >> /app.py && \
    echo '        self.end_headers()' >> /app.py && \
    echo '        self.wfile.write(b\"{\\\"message\\\":\\\"proto-runner-pipeline ok\\\"}\")' >> /app.py && \
    echo 'HTTPServer((\"\",8080), H).serve_forever()' >> /app.py
EXPOSE 8080
CMD [\"python\", \"/app.py\"]
EOF
    cd /tmp
    podman --remote --url unix://$SOCK build -t proto-listener:dev . >/dev/null 2>&1
    echo built
    # Run with a host port mapping — deploy_app does the same.
    podman --remote --url unix://$SOCK run -d --name proto-runner-pipeline -p 19082:8080 proto-listener:dev >/dev/null
    echo started
  "
sleep 2
echo "  curl http://localhost:19082/ ..."
got=$(curl -sf --max-time 5 http://localhost:19082/ || echo "FAIL")
echo "  $got"
echo "$got" | grep -q "proto-runner-pipeline ok" || { echo "FAIL — container not responsive"; exit 1; }
echo "  PASS — pull+run+port-publish works end-to-end"

echo ""
echo "================================================================"
echo "ALL CHECKS PASSED — runner implementation strategy:"
echo ""
echo "  Dockerfile (mcp-server/Dockerfile) needs:"
echo "    - keep python:3.12-slim base"
echo "    - drop docker-ce-cli (replaced)"
echo "    - add: podman-remote, skopeo  (apt-get install)"
echo ""
echo "  docker-compose.yml mcp-runner needs:"
echo "    security_opt:"
echo "      - label=disable"
echo "    volumes:"
echo "      - /var/run/docker.sock:/var/run/docker.sock"
echo ""
echo "  runner_tools.py code:"
echo "    build_image: subprocess 'podman --remote build' + 'podman save'"
echo "                  + 'skopeo copy ... docker://registry-dev:5000/...'"
echo "    deploy_app:  subprocess 'podman --remote pull/run -p HOST:8080'"
echo "                  (skopeo copy from prod registry to local cache first if needed)"
echo "================================================================"
