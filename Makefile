.PHONY: test test-py test-py-mcp test-e2e test-integration test-labctl install-dev \
        small medium large full \
        prewarm-small prewarm-medium prewarm-large prewarm-full \
        down

# Auto-detect docker vs podman so the Make targets work for either engine.
COMPOSE ?= $(shell command -v docker >/dev/null 2>&1 && echo "docker compose" || echo "podman compose")
ENGINE ?= $(shell command -v docker >/dev/null 2>&1 && echo "docker" || echo "podman")

# ─── Tier targets ───────────────────────────────────────────────────────
#
# Four tiers, named with their approximate disk footprint so attendees
# can pick what fits their machine. Each tier is a strict superset of the
# previous one — `make medium` after `make small` adds Gitea without
# tearing down what's already running.
#
#   small  (~700 MB)  user-api + chat-ui + mcp-user                "What is MCP?"
#   medium (~900 MB)  + gitea + mcp-gitea                          "MCP acts on your behalf"
#   large  (~1.5 GB)  + registries + promotion + runner (full lab) "MCP runs your CI/CD"
#   full   (~1.9 GB)  + Gitea Actions runner + Trivy scanner       "real CI + security gates"
#
# Editions: every tier target accepts EDITION=cli|gui (default gui).
# `make full EDITION=cli` skips the Chat UI — ./labctl drives the lab.
#
# Implementation note: each target shells into ./scripts/2-setup.sh with the
# corresponding --tier flag so attendees get the full .env bootstrapping,
# Gitea-token extraction, and MCP image pre-build via the same path the
# legacy single-command setup uses. Doing bare `compose up` from Make would
# skip all that and break the Chat UI's first-run "Start" button.

# Pass --edition only when EDITION is set so 2-setup.sh keeps its own
# default/last-used resolution otherwise.
EDITION_FLAG = $(if $(EDITION),--edition=$(EDITION))

small:
	./scripts/2-setup.sh --tier=small $(EDITION_FLAG)

medium:
	./scripts/2-setup.sh --tier=medium $(EDITION_FLAG)

large:
	./scripts/2-setup.sh --tier=large $(EDITION_FLAG)

full:
	./scripts/2-setup.sh --tier=full $(EDITION_FLAG)

# Pre-warm targets: pull/build images ahead of time without starting them.
# Useful for in-person workshops with shaky venue wifi — run these the
# night before over hotel wifi, then `make small/medium/large/full` is
# offline-fast on workshop morning.
prewarm-small:
	$(COMPOSE) pull user-api chat-ui 2>/dev/null || true
	$(COMPOSE) build user-api chat-ui mcp-user

prewarm-medium: prewarm-small
	$(COMPOSE) pull gitea
	$(COMPOSE) build mcp-gitea

prewarm-large: prewarm-medium
	$(COMPOSE) pull registry-dev registry-staging registry-prod
	$(COMPOSE) build promotion-service mcp-registry mcp-promotion mcp-runner

prewarm-full: prewarm-large
	COMPOSE_PROFILES=ci,security $(COMPOSE) pull trivy act-runner
	$(ENGINE) build -t mcp-lab-ci-base:latest ./ci-base

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

# labctl CLI tests (stdlib-only; mocked HTTP + subprocess, no containers).
test-labctl:
	cd labctl-cli && python3 -m pytest -v

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
