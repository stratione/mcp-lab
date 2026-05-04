.PHONY: test test-py test-py-mcp test-e2e test-integration install-dev \
        small medium large \
        prewarm-small prewarm-medium prewarm-large \
        down

# Auto-detect docker vs podman so the Make targets work for either engine.
COMPOSE ?= $(shell command -v docker >/dev/null 2>&1 && echo "docker compose" || echo "podman compose")

# ─── Tier targets ───────────────────────────────────────────────────────
#
# Three tiers, named with their approximate disk footprint so attendees
# can pick what fits their machine. Each tier is a strict superset of the
# previous one — `make medium` after `make small` adds Gitea without
# tearing down what's already running.
#
#   small  (~700 MB)  user-api + chat-ui + mcp-user                "What is MCP?"
#   medium (~900 MB)  + gitea + mcp-gitea                          "MCP acts on your behalf"
#   large  (~1.5 GB)  + registries + promotion + runner (full lab) "MCP runs your CI/CD"
#
# Implementation note: each target shells into ./scripts/2-setup.sh with the
# corresponding --tier flag so attendees get the full .env bootstrapping,
# Gitea-token extraction, and MCP image pre-build via the same path the
# legacy single-command setup uses. Doing bare `compose up` from Make would
# skip all that and break the Chat UI's first-run "Start" button.

small:
	./scripts/2-setup.sh --tier=small

medium:
	./scripts/2-setup.sh --tier=medium

large:
	./scripts/2-setup.sh --tier=large

# Pre-warm targets: pull/build images ahead of time without starting them.
# Useful for in-person workshops with shaky venue wifi — run these the
# night before over hotel wifi, then `make small/medium/large` is offline-
# fast on workshop morning.
prewarm-small:
	$(COMPOSE) pull user-api chat-ui 2>/dev/null || true
	$(COMPOSE) build user-api chat-ui mcp-user

prewarm-medium: prewarm-small
	$(COMPOSE) pull gitea
	$(COMPOSE) build mcp-gitea

prewarm-large: prewarm-medium
	$(COMPOSE) pull registry-dev registry-prod
	$(COMPOSE) build promotion-service mcp-registry mcp-promotion mcp-runner

down:
	$(COMPOSE) down

# Default = fast suite only (no real containers required for backend tests).
test: test-py test-e2e

# Backend Python tests for chat-ui (uses httpx ASGITransport, no network).
test-py:
	cd chat-ui && python3 -m pytest -v

# Backend Python tests for the MCP servers (added in M1+).
test-py-mcp:
	cd mcp-server && python3 -m pytest -v

# End-to-end browser tests via Cypress (requires chat-ui running on :3001).
test-e2e:
	cd chat-ui && ./node_modules/.bin/cypress run --browser chrome --headless

# Slow integration tests that need real running containers
# (full lab up: ./scripts/2-setup.sh + all 5 MCP servers).
test-integration:
	cd chat-ui && python3 -m pytest -v -m integration

# One-shot installer for dev deps.
install-dev:
	cd chat-ui && python3 -m pip install -r requirements-dev.txt
	cd chat-ui && npm install
