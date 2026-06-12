"""The ONE helper every labctl subprocess call goes through.

`run_cmd()` echoes the exact command line (prefix `→ raw: `) when --verbose
is on, then executes it. Tests monkeypatch `_execute` to assert the exact
argv labctl would run, without needing a container engine.
"""

import shlex
import shutil
import subprocess

from . import render
from .errors import LabError


def run_cmd(ctx, argv, capture=True, stream=False):
    """Run argv. capture=True returns stdout/stderr text; stream=True
    inherits the terminal (for setup scripts / logs)."""
    argv = [str(a) for a in argv]
    render.echo_raw(ctx, shlex.join(argv))
    return _execute(argv, capture=capture, stream=stream)


def _execute(argv, capture=True, stream=False):
    if shutil.which(argv[0]) is None:
        raise LabError(
            "'{}' not found on PATH — install it, or pick the engine with "
            "--engine docker|podman".format(argv[0])
        )
    if stream:
        rc = subprocess.call(argv)
        return subprocess.CompletedProcess(argv, rc, stdout="", stderr="")
    return subprocess.run(argv, capture_output=capture, text=True)
