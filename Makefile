.PHONY: test test-py test-py-mcp test-e2e test-integration install-dev

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
# (full lab up: ./scripts/1-setup.sh + all 5 MCP servers).
test-integration:
	cd chat-ui && python3 -m pytest -v -m integration

# One-shot installer for dev deps.
install-dev:
	cd chat-ui && python3 -m pip install -r requirements-dev.txt
	cd chat-ui && npm install
