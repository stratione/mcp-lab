# NOTE: build context is the REPO ROOT (compose sets context: . +
# dockerfile: chat-ui/Dockerfile) so this image can vendor labctl_pkg —
# the stdlib-only labctl package that powers the Learn Mode Verify buttons
# with the exact same checks as `./labctl check <n>`.
FROM node:22-alpine AS web-builder
WORKDIR /web
COPY chat-ui/web/package.json chat-ui/web/package-lock.json ./
RUN npm ci
COPY chat-ui/web/ ./
RUN VITE_DOCKER=1 npm run build

FROM python:3.12-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl gnupg \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
    && chmod a+r /etc/apt/keyrings/docker.asc \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends docker-ce-cli docker-compose-plugin \
    && apt-get purge -y gnupg && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY chat-ui/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY chat-ui/app/ ./app/
# Vendored, never forked: the single source of truth for module checks stays
# labctl-cli/labctl_pkg. /app is on sys.path (uvicorn cwd), so the backend
# imports it as `labctl_pkg`.
COPY labctl-cli/labctl_pkg/ ./labctl_pkg/
COPY --from=web-builder /web/dist ./app/static

EXPOSE 3001
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "3001"]
