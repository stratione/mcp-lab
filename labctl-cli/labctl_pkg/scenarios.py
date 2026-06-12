"""Break/fix teaching scenarios, applied via the Gitea contents API.

`break` commits a deliberately broken file to mcpadmin/sample-app; `fix`
restores the canonical content. Both are idempotent create-or-update calls
(gitea.put_contents handles the sha flow and skips no-op commits).

Canonical app.py / Dockerfile content mirrors scripts/_internal/init-gitea.sh.
"""

from . import env, gitea

# ── canonical sample-app content (source of truth: init-gitea.sh) ───────────
CANONICAL_DOCKERFILE = """FROM python:3.12-slim
LABEL maintainer="mcp-lab"
WORKDIR /app
COPY app.py .
EXPOSE 8080
CMD ["python", "app.py"]
"""

TYPO_DOCKERFILE = CANONICAL_DOCKERFILE.replace(
    "FROM python:3.12-slim", "FROM pythn:3.12-slim", 1)

VULNERABLE_DOCKERFILE = CANONICAL_DOCKERFILE.replace(
    "FROM python:3.12-slim", "FROM python:3.8-slim", 1)

PASSING_TEST = '''"""Sample test for hello-app (passing). Run by CI: python3 -m pytest -q."""

import app


def test_version_is_set():
    assert isinstance(app.VERSION, str) and app.VERSION
'''

FAILING_TEST = '''"""Deliberately failing test, committed by `labctl break failing-test`.

Fix it by hand (module 2 drill) or run: labctl fix failing-test
"""

import app


def test_version_matches_release():
    assert app.VERSION == "9.9.9", "deliberate failure: VERSION is not 9.9.9"
'''

# ── canonical CI workflow (contract §6) — committed by `labctl ci init` ─────
CI_WORKFLOW_PATH = ".gitea/workflows/ci.yml"
CI_WORKFLOW = """name: CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Clone
        run: |
          git clone http://mcpadmin:mcpadmin123@gitea:3000/mcpadmin/sample-app.git .
          git checkout "$GITHUB_SHA"
      - name: Test
        run: |
          if ls test_*.py >/dev/null 2>&1; then python3 -m pytest -q; else echo "no tests"; fi
      - name: Build image
        run: |
          docker build -t hello-app:"$GITHUB_SHA" -t hello-app:latest .
      - name: Push to dev registry
        run: |
          skopeo copy --dest-tls-verify=false docker-daemon:hello-app:latest docker://registry-dev:5000/hello-app:latest
          skopeo copy --dest-tls-verify=false docker-daemon:hello-app:"$GITHUB_SHA" docker://registry-dev:5000/hello-app:"$GITHUB_SHA"
      - name: Notify chat-ui
        run: |
          curl -sf -X POST http://chat-ui:3001/api/events -H 'Content-Type: application/json' \\
            -d "{\\"source\\":\\"runner\\",\\"type\\":\\"ci.success\\",\\"summary\\":\\"CI built hello-app @ ${GITHUB_SHA}\\"}" || true
"""

SCENARIOS = {
    "dockerfile-typo": {
        "description": "Dockerfile FROM has a typo (pythn:3.12-slim) — the CI build step fails.",
        "break": {"Dockerfile": TYPO_DOCKERFILE},
        "fix": {"Dockerfile": CANONICAL_DOCKERFILE},
    },
    "failing-test": {
        "description": "test_app.py asserts a wrong version — the CI test step fails.",
        "break": {"test_app.py": FAILING_TEST},
        "fix": {"test_app.py": PASSING_TEST},
    },
    "vulnerable-base": {
        "description": "Dockerfile base switches to CVE-laden python:3.8-slim — the scan gate blocks promotion.",
        "break": {"Dockerfile": VULNERABLE_DOCKERFILE},
        "fix": {"Dockerfile": CANONICAL_DOCKERFILE},
    },
}


def apply(ctx, name, mode):
    """mode ∈ break|fix. Returns [(path, action), ...]."""
    spec = SCENARIOS[name]
    results = []
    for path, content in spec[mode].items():
        action = gitea.put_contents(
            ctx, env.DEFAULT_OWNER, env.DEFAULT_REPO, path, content,
            "labctl {} {}".format(mode, name))
        results.append((path, action))
    return results
