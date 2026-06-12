# CI job base image for the lab's Gitea Actions runner (act-runner).
# Built locally as mcp-lab-ci-base:latest by 2-setup.sh (full tier) and
# `make prewarm-full` — never pushed to any registry.
#
# docker:27-cli gives jobs a docker client that talks to the host engine
# over the socket the runner mounts into every job container. skopeo lets
# the canonical CI workflow push images registry-to-registry without a
# local daemon-side tag dance.
FROM docker:27-cli

LABEL mcp-lab.teardown="true"

RUN apk add --no-cache git bash curl jq skopeo nodejs python3 py3-pytest
