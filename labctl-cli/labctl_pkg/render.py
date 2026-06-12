"""Output helpers: hand-rolled ANSI colors, tables, raw-command echo, JSON.

Colors are disabled when stdout is not a TTY, when NO_COLOR is set, or when
TERM=dumb. The `→ raw:` echo (verbose mode) goes to stderr so that --json
output on stdout stays machine-parseable.
"""

import json
import os
import re
import sys

_ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")

_CODES = {
    "red": "31",
    "green": "32",
    "yellow": "33",
    "blue": "34",
    "magenta": "35",
    "cyan": "36",
    "dim": "2",
    "bold": "1",
}


def color_enabled():
    if os.environ.get("NO_COLOR"):
        return False
    if os.environ.get("TERM") == "dumb":
        return False
    try:
        return sys.stdout.isatty()
    except Exception:
        return False


def c(text, name):
    """Colorize `text` with the named code, if colors are enabled."""
    if not color_enabled():
        return str(text)
    return "\x1b[{}m{}\x1b[0m".format(_CODES[name], text)


def strip_ansi(s):
    return _ANSI_RE.sub("", str(s))


def echo_raw(ctx, line):
    """Print the raw-equivalent command for an action (verbose mode only).

    Always goes to stderr so `--json` stdout stays clean.
    """
    if getattr(ctx, "verbose", False):
        print(c("→ raw: ", "dim") + line, file=sys.stderr)


def err(msg):
    print(c("error: ", "red") + str(msg), file=sys.stderr)


def warn(msg):
    print(c("warning: ", "yellow") + str(msg), file=sys.stderr)


def pass_fail(ok):
    return c("PASS", "green") if ok else c("FAIL", "red")


def table(headers, rows):
    """Render a simple aligned text table (ANSI-aware widths)."""
    rows = [[str(cell) for cell in row] for row in rows]
    widths = []
    for i, h in enumerate(headers):
        w = len(strip_ansi(h))
        for row in rows:
            if i < len(row):
                w = max(w, len(strip_ansi(row[i])))
        widths.append(w)

    def pad(s, w):
        return s + " " * (w - len(strip_ansi(s)))

    lines = [
        "  ".join(pad(c(h, "bold"), widths[i]) for i, h in enumerate(headers)),
        "  ".join("-" * w for w in widths),
    ]
    for row in rows:
        lines.append("  ".join(pad(cell, widths[i]) for i, cell in enumerate(row)))
    return "\n".join(lines)


def print_table(headers, rows):
    print(table(headers, rows))


def print_json(obj):
    print(json.dumps(obj, indent=2))
