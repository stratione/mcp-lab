"""Contract §1 deploy canon — deploy_app must use:
  container name  mcp-lab-app-<env>
  host ports      dev=9080, staging=9081, prod=9082 → container 8080
  labels          mcp-lab.teardown=true, mcp-lab.deployed=true, mcp-lab.env=<env>
  network         mcp-lab-net
  image pulled from the registry matching the environment

Subprocess calls are captured; no containers needed.
"""

import asyncio
import json

import pytest
from mcp.server.fastmcp import FastMCP

from mcp_server import config, engine
from tests.helpers import registered_tools


class FakeProc:
    def __init__(self, returncode, stdout=b"", stderr=b""):
        self.returncode = returncode
        self._stdout = stdout
        self._stderr = stderr

    async def communicate(self):
        return self._stdout, self._stderr


@pytest.fixture
def force_docker_engine(monkeypatch):
    monkeypatch.setenv("CONTAINER_ENGINE_FORCE", "docker")
    monkeypatch.setattr(engine, "_DETECTED_ENGINE", None)
    yield
    monkeypatch.setattr(engine, "_DETECTED_ENGINE", None)


@pytest.fixture
def lab_config(monkeypatch):
    monkeypatch.setattr(config, "DEV_REGISTRY_HOST", "registry-dev:5000")
    monkeypatch.setattr(config, "STAGING_REGISTRY_HOST", "registry-staging:5000")
    monkeypatch.setattr(config, "PROD_REGISTRY_HOST", "registry-prod:5000")


@pytest.fixture
def deploy_tool():
    from mcp_server.tools import deploy_tools
    mcp = FastMCP("test-deploy-canon")
    deploy_tools.register(mcp)
    return registered_tools(mcp)["deploy_app"]


def _capture_subprocess(monkeypatch):
    captured: list[tuple] = []

    async def fake_exec(*args, **kwargs):
        captured.append(args)
        # container id on stdout for the `run` step; everything succeeds
        return FakeProc(returncode=0, stdout=b"deadbeefcafe0123456789")

    monkeypatch.setattr(asyncio, "create_subprocess_exec", fake_exec)
    return captured


def _find_run_argv(captured):
    """The `engine run -d` invocation (skip rm/load/skopeo steps)."""
    for argv in captured:
        if "run" in argv and "-d" in argv:
            return argv
    raise AssertionError(f"no engine run invocation found in {captured!r}")


@pytest.mark.parametrize("env,port,registry_host", [
    ("dev", 9080, "registry-dev:5000"),
    ("staging", 9081, "registry-staging:5000"),
    ("prod", 9082, "registry-prod:5000"),
])
async def test_deploy_canon_per_environment(monkeypatch, force_docker_engine, lab_config,
                                            deploy_tool, env, port, registry_host):
    captured = _capture_subprocess(monkeypatch)

    out = await deploy_tool(image_name="hello-app", tag="latest", environment=env)
    parsed = json.loads(out)
    assert parsed["status"] == "success"
    assert parsed["container"] == f"mcp-lab-app-{env}"
    assert parsed["app_url"] == f"http://localhost:{port}"

    # pull comes from the env-matching registry (skopeo source ref)
    skopeo = next(a for a in captured if a[0] == "skopeo")
    assert f"docker://{registry_host}/hello-app:latest" in skopeo

    run_argv = _find_run_argv(captured)
    joined = " ".join(run_argv)
    assert f"--name mcp-lab-app-{env}" in joined
    assert "--network mcp-lab-net" in joined
    assert f"-p {port}:8080" in joined
    assert "--label mcp-lab.teardown=true" in joined
    assert "--label mcp-lab.deployed=true" in joined
    assert f"--label mcp-lab.env={env}" in joined


async def test_deploy_rejects_unknown_environment(deploy_tool):
    out = await deploy_tool(environment="qa")
    parsed = json.loads(out)
    assert parsed["status"] == "error"
    assert "dev, staging, prod" in parsed["error"]


async def test_deploy_removes_existing_container_first(monkeypatch, force_docker_engine,
                                                       lab_config, deploy_tool):
    captured = _capture_subprocess(monkeypatch)
    await deploy_tool(environment="staging")
    rm = captured[0]
    assert rm[0] == "docker"
    assert ("rm", "-f", "mcp-lab-app-staging") == rm[1:4]
