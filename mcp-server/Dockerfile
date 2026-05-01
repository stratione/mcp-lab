FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install git, podman (for --remote), and skopeo for mcp-runner.
# Build pipeline: podman --remote build → podman save → skopeo copy.
# (Replaced docker-ce-cli; podman speaks the same socket on both engines
# and skopeo bypasses the daemon-side DNS issue when pushing to the lab
# registry. See plan_workshop_ready.md D-014.)
RUN apt-get update && apt-get install -y --no-install-recommends \
      git \
      podman \
      skopeo \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY mcp_server/ ./mcp_server/

EXPOSE 8003

CMD ["python", "-m", "mcp_server.server"]
