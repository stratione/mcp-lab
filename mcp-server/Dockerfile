FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install git + podman + skopeo + docker CLI for mcp-runner.
#
# Engine dispatch (mcp_server/engine.py): on Docker hosts we shell out via
# `docker build/save/load/run` against /var/run/docker.sock; on Podman hosts
# we use `podman --remote --url unix:///var/run/docker.sock` against
# podman.socket. We need both CLIs because the lab supports both engines.
# skopeo handles registry pushes/pulls in either case (bypasses the
# daemon-side DNS issue for compose-internal hostnames).
#
# Pinned versions insulate from upstream Debian apt churn for the Debian
# packages; docker-ce-cli comes from Docker's official apt repo.
ARG PODMAN_VERSION=4.3.1+ds1-8+deb12u2
ARG SKOPEO_VERSION=1.9.3+ds1-1+b8
ARG GIT_VERSION=1:2.39.5-0+deb12u2
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl gnupg ca-certificates \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
    && chmod a+r /etc/apt/keyrings/docker.asc \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
       > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && (apt-get install -y --no-install-recommends \
          "git=${GIT_VERSION}" \
          "podman=${PODMAN_VERSION}" \
          "skopeo=${SKOPEO_VERSION}" \
          docker-ce-cli \
        || (echo "WARNING: pinned versions unavailable; falling back to latest" \
            && apt-get install -y --no-install-recommends \
               git podman skopeo docker-ce-cli)) \
    && apt-get purge -y gnupg \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

COPY mcp_server/ ./mcp_server/

EXPOSE 8003

CMD ["python", "-m", "mcp_server.server"]
