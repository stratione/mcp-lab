"""M9: /api/probe must accept only the lab's known ports, not arbitrary ones.
This prevents the chat-ui from being used as a port-scan reflector."""

import pytest


ALLOWED = ["3000", "3001", "5001", "5002", "8001", "8002",
           "8003", "8004", "8005", "8006", "8007", "9080", "9081", "9082", "11434"]
BLOCKED = ["22", "80", "443", "1234", "8080", "9090", "65535"]


@pytest.mark.parametrize("port", ALLOWED)
def test_probe_allowlist_accepts_lab_ports(port):
    from app.main import _PROBE_ALLOWLIST
    assert _PROBE_ALLOWLIST.match(f"http://localhost:{port}/anything")
    assert _PROBE_ALLOWLIST.match(f"http://127.0.0.1:{port}/")


@pytest.mark.parametrize("port", BLOCKED)
def test_probe_allowlist_blocks_unknown_ports(port):
    from app.main import _PROBE_ALLOWLIST
    assert not _PROBE_ALLOWLIST.match(f"http://localhost:{port}/")


def test_probe_allowlist_blocks_external_hosts():
    from app.main import _PROBE_ALLOWLIST
    assert not _PROBE_ALLOWLIST.match("http://evil.com/")
    assert not _PROBE_ALLOWLIST.match("http://192.168.1.1:3000/")
    assert not _PROBE_ALLOWLIST.match("https://localhost:3000/")  # https not allowed
