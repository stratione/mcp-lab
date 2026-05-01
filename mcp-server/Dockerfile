FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install git, podman (for --remote), and skopeo for mcp-runner.
# Build pipeline: podman --remote build → podman save → skopeo copy.
# (Replaced docker-ce-cli; podman speaks the same socket on both engines
# and skopeo bypasses the daemon-side DNS issue when pushing to the lab
# registry. See plan_workshop_ready.md D-014.)
# Pinned versions insulate the talk from upstream Debian apt churn.
# Update deliberately; never let a `docker compose build` silently bump these.
ARG PODMAN_VERSION=4.3.1+ds1-8+deb12u2
ARG SKOPEO_VERSION=1.9.3+ds1-1+b8
ARG GIT_VERSION=1:2.39.5-0+deb12u2
RUN apt-get update && apt-get install -y --no-install-recommends \
      "git=${GIT_VERSION}" \
      "podman=${PODMAN_VERSION}" \
      "skopeo=${SKOPEO_VERSION}" \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
 || (echo "WARNING: pinned versions unavailable; falling back to latest" \
     && apt-get update && apt-get install -y --no-install-recommends \
        git podman skopeo ca-certificates \
     && rm -rf /var/lib/apt/lists/*)

COPY mcp_server/ ./mcp_server/

EXPOSE 8003

CMD ["python", "-m", "mcp_server.server"]
