# ci-base — the lab's CI job image

Base image (`mcp-lab-ci-base:latest`) that Gitea Actions jobs run in: docker CLI + git/bash/curl/jq/skopeo/node/python/pytest.
Built locally by `./scripts/2-setup.sh --tier=full` or `make prewarm-full`; never pushed to a registry.
